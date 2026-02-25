// src/services/googleCalendar.ts
import { Job, JobStatus, SchedulingType, JobShift, ExternalEvent } from "../types";

const CALENDAR_ID = "primary";
const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

function tz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISODate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0));
}

function addDays(dateStr: string, days: number): string {
  const dt = parseISODate(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toISODate(dt);
}

function clampRangeStart(dateStr: string, daysBack = 7): string {
  return addDays(dateStr, -Math.abs(daysBack));
}

function clampRangeEnd(dateStr: string, daysForward = 7): string {
  return addDays(dateStr, Math.abs(daysForward));
}

/**
 * Google Calendar colorId values are strings.
 * Common ones:
 *  - "11" red
 *  - "5"  yellow
 *  - "10" green
 *  - "9"  blue
 *  - "8"  graphite/dark grey (closest to "black")
 */
function statusToColorId(status: JobStatus): string {
  switch (status) {
    case JobStatus.POTENTIAL:
      return "11";
    case JobStatus.PENCILLED:
      return "5";
    case JobStatus.CONFIRMED:
      return "10";
    case JobStatus.AWAITING_PAYMENT:
      return "9";
    case JobStatus.COMPLETED:
      return "8";
    default:
      return "1";
  }
}

function buildSummary(job: Job, clientName?: string): string {
  const c = (clientName || "Client").trim();
  const j = (job.description || "Job").trim();
  return `${c} — ${j} (${job.id})`;
}

function buildWhenFromJobOrShift(job: Job, shift?: JobShift) {
  const timezone = tz();

  const startDate = (shift?.startDate || job.startDate || "").trim();
  const endDate = (shift?.endDate || shift?.startDate || job.endDate || startDate || "").trim();

  const isFullDay = shift ? (shift as any).isFullDay !== false : true;

  if (!startDate) throw new Error("Calendar: missing start date");

  if (isFullDay) {
    // all-day end date is EXCLUSIVE
    const endExclusive = addDays(endDate || startDate, 1);
    return {
      start: { date: startDate },
      end: { date: endExclusive },
      timezone,
      isFullDay: true,
    };
  }

  const startTime = ((shift as any)?.startTime || "09:00").trim();
  const endTime = ((shift as any)?.endTime || "17:30").trim();

  const startDT = `${startDate}T${startTime}:00`;
  const endDT = `${(endDate || startDate)}T${endTime}:00`;

  return {
    start: { dateTime: startDT, timeZone: timezone },
    end: { dateTime: endDT, timeZone: timezone },
    timezone,
    isFullDay: false,
  };
}

async function gcalFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...(init || {}),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }

  return res;
}

async function listEventsByJobId(accessToken: string, jobId: string, timeMin: string, timeMax: string) {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
    timeMin,
    timeMax,
    privateExtendedProperty: `freelanceosJobId=${jobId}`,
  });

  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params.toString()}`;
  const res = await gcalFetch(accessToken, url);
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

async function upsertEvent(
  accessToken: string,
  body: any,
  jobId: string,
  shiftId?: string,
  timeMin?: string,
  timeMax?: string
) {
  const safeMin = timeMin || new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();
  const safeMax = timeMax || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();

  const existing = await listEventsByJobId(accessToken, jobId, safeMin, safeMax);

  const matching = existing.filter((ev: any) => {
    const priv = ev?.extendedProperties?.private || {};
    if (priv.freelanceosJobId !== jobId) return false;
    if (shiftId) return priv.freelanceosShiftId === shiftId;
    return !priv.freelanceosShiftId;
  });

  // De-dupe
  if (matching.length > 1) {
    const extras = matching.slice(1);
    await Promise.allSettled(
      extras.map((ev: any) =>
        gcalFetch(
          accessToken,
          `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(ev.id)}`,
          { method: "DELETE" }
        )
      )
    );
  }

  const target = matching[0];

  if (target?.id) {
    const url = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(target.id)}`;
    await gcalFetch(accessToken, url, { method: "PATCH", body: JSON.stringify(body) });
    return target.id;
  }

  const insertUrl = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const res = await gcalFetch(accessToken, insertUrl, { method: "POST", body: JSON.stringify(body) });
  const created = await res.json();
  return created?.id;
}

export async function syncJobToGoogle(job: Job, accessToken: string, clientName?: string) {
  if (!accessToken) return;
  if (!job?.id) throw new Error("Calendar: missing job id");

  // Cancelled should NOT show at all
  if (job.status === JobStatus.CANCELLED) {
    await deleteJobFromGoogle(job.id, accessToken);
    return;
  }

  let rangeStart = job.startDate || "";
  let rangeEnd = job.endDate || job.startDate || "";

  const shifts: JobShift[] = Array.isArray((job as any).shifts) ? ((job as any).shifts as JobShift[]) : [];

  if (job.schedulingType === SchedulingType.SHIFT_BASED && shifts.length) {
    const starts = shifts.map((s) => s.startDate).filter(Boolean).sort();
    const ends = shifts.map((s) => (s as any).endDate || s.startDate).filter(Boolean).sort();
    rangeStart = starts[0] || rangeStart;
    rangeEnd = ends[ends.length - 1] || rangeEnd;
  }

  if (!rangeStart) throw new Error("Calendar: missing start date");

  const timeMin = new Date(`${clampRangeStart(rangeStart)}T00:00:00.000Z`).toISOString();
  const timeMax = new Date(`${clampRangeEnd(rangeEnd || rangeStart)}T23:59:59.999Z`).toISOString();

  const summary = buildSummary(job, clientName);
  const colorId = statusToColorId(job.status);

  const common = {
    summary,
    location: (job.location || "").trim() || undefined,
    description: [
      `Job ID: ${job.id}`,
      `Status: ${job.status}`,
      job.poNumber ? `PO: ${job.poNumber}` : "",
      job.location ? `Location: ${job.location}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    colorId,
    extendedProperties: {
      private: {
        freelanceosJobId: String(job.id),
        tenantId: String((job as any).tenant_id || ""),
      },
    },
  };

  // SHIFT BASED
  if (job.schedulingType === SchedulingType.SHIFT_BASED && shifts.length) {
    // Remove any continuous event for this job, keep shifts only
    const allExisting = await listEventsByJobId(accessToken, String(job.id), timeMin, timeMax);
    const continuous = allExisting.filter((ev: any) => {
      const priv = ev?.extendedProperties?.private || {};
      return priv.freelanceosJobId === String(job.id) && !priv.freelanceosShiftId;
    });

    await Promise.allSettled(
      continuous.map((ev: any) =>
        gcalFetch(
          accessToken,
          `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(ev.id)}`,
          { method: "DELETE" }
        )
      )
    );

    // Upsert each shift
    for (const shift of shifts) {
      const shiftId = String((shift as any).id || "");
      if (!shiftId) continue;

      const when = buildWhenFromJobOrShift(job, shift);

      const body = {
        ...common,
        ...when,
        extendedProperties: {
          private: {
            ...(common.extendedProperties.private || {}),
            freelanceosShiftId: shiftId,
            freelanceosShiftTitle: String((shift as any).title || ""),
          },
        },
      };

      await upsertEvent(accessToken, body, String(job.id), shiftId, timeMin, timeMax);
    }

    // Cleanup stale shifts
    const refreshed = await listEventsByJobId(accessToken, String(job.id), timeMin, timeMax);
    const validShiftIds = new Set(shifts.map((s: any) => String(s.id)));
    const stale = refreshed.filter((ev: any) => {
      const priv = ev?.extendedProperties?.private || {};
      const sid = priv.freelanceosShiftId;
      return sid && !validShiftIds.has(String(sid));
    });

    await Promise.allSettled(
      stale.map((ev: any) =>
        gcalFetch(
          accessToken,
          `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(ev.id)}`,
          { method: "DELETE" }
        )
      )
    );

    return;
  }

  // CONTINUOUS
  const when = buildWhenFromJobOrShift(job);
  const body = { ...common, ...when };
  await upsertEvent(accessToken, body, String(job.id), undefined, timeMin, timeMax);
}

export async function deleteJobFromGoogle(jobId: string, accessToken: string) {
  if (!accessToken || !jobId) return;

  const min = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
  const max = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 2).toISOString();

  const events = await listEventsByJobId(accessToken, String(jobId), min, max);
  await Promise.allSettled(
    events.map((ev: any) =>
      gcalFetch(
        accessToken,
        `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(ev.id)}`,
        { method: "DELETE" }
      )
    )
  );
}

/**
 * Pull personal Google Calendar events for in-app calendar display.
 * - filters out FreelanceOS-managed events (those with extendedProperties.private.freelanceosJobId)
 */
export async function listPersonalGoogleEvents(
  accessToken: string,
  opts?: { timeMin?: string; timeMax?: string; maxResults?: number }
): Promise<ExternalEvent[]> {
  if (!accessToken) return [];

  const timeMin = opts?.timeMin || new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(); // 60d back
  const timeMax = opts?.timeMax || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(); // 12m forward
  const maxResults = String(opts?.maxResults ?? 2500);

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults,
    timeMin,
    timeMax,
  });

  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params.toString()}`;
  const res = await gcalFetch(accessToken, url);
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  const out: ExternalEvent[] = [];

  for (const ev of items) {
    const priv = ev?.extendedProperties?.private || {};
    if (priv?.freelanceosJobId) continue; // skip managed events

    const title = String(ev?.summary || "Busy").trim() || "Busy";
    const link = ev?.htmlLink ? String(ev.htmlLink) : undefined;

    const start = (ev?.start?.dateTime as string) || (ev?.start?.date as string) || null;
    const end = (ev?.end?.dateTime as string) || (ev?.end?.date as string) || null;
    if (!start || !end) continue;

    out.push({
      id: String(ev.id),
      title,
      startDate: start.slice(0, 10),
      endDate: end.slice(0, 10),
      source: "google",
      link,
    } as any);
  }

  return out;
}