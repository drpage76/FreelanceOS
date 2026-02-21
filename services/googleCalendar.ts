// src/services/googleCalendar.ts
import { Job, JobStatus, SchedulingType, JobShift } from "../types";

const CALENDAR_ID = "primary";
const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Google Calendar colorId reference (common):
 * 1 lavender, 2 sage, 3 grape, 4 flamingo, 5 banana, 6 tangerine,
 * 7 peacock, 8 graphite, 9 blueberry, 10 basil, 11 tomato
 */
function statusToColorId(status: JobStatus): string {
  switch (status) {
    // ✅ Your requested mapping:
    // potential = red, pencilled = amber, confirmed = green,
    // awaiting payment = blue, complete = black (approx graphite).
    case JobStatus.POTENTIAL:
      return "11"; // tomato (red)
    case JobStatus.PENCILED:
      return "6"; // tangerine (amber/orange)
    case JobStatus.CONFIRMED:
      return "10"; // basil (green)
    case JobStatus.AWAITING_PAYMENT:
      return "9"; // blueberry (blue)
    case JobStatus.COMPLETED:
      return "8"; // graphite (closest to "black")

    // Cancelled should NEVER show (we delete instead)
    case JobStatus.CANCELLED:
      return "11";

    default:
      return "1";
  }
}

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
  // dateStr expected: YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0));
}

function addDays(dateStr: string, days: number): string {
  const dt = parseISODate(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toISODate(dt);
}

function clampRangeStart(dateStr: string, daysBack = 30): string {
  return addDays(dateStr, -Math.abs(daysBack));
}

function clampRangeEnd(dateStr: string, daysForward = 30): string {
  return addDays(dateStr, Math.abs(daysForward));
}

function buildSummary(job: Job, clientName?: string): string {
  const c = (clientName || "Client").trim();
  const j = (job.description || "Job").trim();
  return `${c} — ${j} (${job.id})`;
}

/**
 * Build an event time block.
 * - All-day events: end.date is EXCLUSIVE => add +1 day
 * - Timed events: dateTime + timeZone
 */
function buildWhenFromJobOrShift(job: Job, shift?: JobShift) {
  const timezone = tz();

  const startDate = (shift?.startDate || job.startDate || "").trim();
  const endDate = (shift?.endDate || shift?.startDate || job.endDate || startDate || "").trim();

  const isFullDay = shift ? (shift as any).isFullDay !== false : true;

  if (!startDate) throw new Error("Calendar: missing start date");

  if (isFullDay) {
    const endExclusive = addDays(endDate || startDate, 1);
    return {
      start: { date: startDate },
      end: { date: endExclusive },
      isFullDay: true,
      timezone,
    };
  }

  const startTime = ((shift as any)?.startTime || "09:00").trim();
  const endTime = ((shift as any)?.endTime || "17:30").trim();

  // IMPORTANT: For Google Calendar API, dateTime with timeZone is valid
  const startDT = `${startDate}T${startTime}:00`;
  const endDT = `${(endDate || startDate)}T${endTime}:00`;

  return {
    start: { dateTime: startDT, timeZone: timezone },
    end: { dateTime: endDT, timeZone: timezone },
    isFullDay: false,
    timezone,
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

/**
 * List events matching our private extended property
 */
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

/**
 * Robust Upsert:
 * - Find event(s) by our private extended props
 * - If duplicates: delete extras
 * - PATCH existing
 * - If PATCH fails with 404/400 (stale/bad id): fall back to INSERT
 */
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
    if (String(priv.freelanceosJobId) !== String(jobId)) return false;
    if (shiftId) return String(priv.freelanceosShiftId) === String(shiftId);
    return !priv.freelanceosShiftId;
  });

  if (matching.length > 1) {
    const extras = matching.slice(1);
    await Promise.allSettled(
      extras.map((ev: any) =>
        gcalFetch(
          accessToken,
          `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(String(ev.id || ""))}`,
          { method: "DELETE" }
        )
      )
    );
  }

  const target = matching[0];
  const targetId = String(target?.id || "").trim();

  // Never send `id` on insert/update body
  const safeBody = { ...body };
  delete (safeBody as any).id;

  if (targetId) {
    const url = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(targetId)}`;

    try {
      await gcalFetch(accessToken, url, { method: "PATCH", body: JSON.stringify(safeBody) });
      return targetId;
    } catch (e: any) {
      // If Google says "Invalid resource id value" or 404, it usually means stale/bad event id.
      // Fall back to insert to keep sync resilient.
      console.warn("[GCAL PATCH failed; falling back to INSERT]", e?.message || e);
    }
  }

  const insertUrl = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const res = await gcalFetch(accessToken, insertUrl, { method: "POST", body: JSON.stringify(safeBody) });
  const created = await res.json();
  return created?.id;
}

/**
 * Public: Sync a job to Google Calendar
 */
export async function syncJobToGoogle(job: Job, accessToken: string, clientName?: string) {
  if (!accessToken) return;
  if (!job?.id) throw new Error("Calendar: missing job id");

  // ✅ Cancelled should not show at all
  if (job.status === JobStatus.CANCELLED) {
    await deleteJobFromGoogle(String(job.id), accessToken);
    return;
  }

  let rangeStart = job.startDate || "";
  let rangeEnd = job.endDate || job.startDate || "";

  const shifts: JobShift[] = Array.isArray((job as any).shifts) ? ((job as any).shifts as JobShift[]) : [];

  if (job.schedulingType === SchedulingType.SHIFT_BASED && shifts.length) {
    const starts = shifts.map((s) => (s as any).startDate).filter(Boolean).sort();
    const ends = shifts.map((s) => ((s as any).endDate || (s as any).startDate)).filter(Boolean).sort();
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

  // SHIFT-BASED
  if (job.schedulingType === SchedulingType.SHIFT_BASED && shifts.length) {
    // delete any old continuous event
    const allExisting = await listEventsByJobId(accessToken, String(job.id), timeMin, timeMax);
    const continuous = allExisting.filter((ev: any) => {
      const priv = ev?.extendedProperties?.private || {};
      return String(priv.freelanceosJobId) === String(job.id) && !priv.freelanceosShiftId;
    });

    await Promise.allSettled(
      continuous.map((ev: any) =>
        gcalFetch(
          accessToken,
          `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(String(ev.id || ""))}`,
          { method: "DELETE" }
        )
      )
    );

    // upsert each shift
    for (const shift of shifts) {
      const shiftId = String((shift as any).id || "").trim();
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

    // cleanup stale shift events
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
          `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(String(ev.id || ""))}`,
          { method: "DELETE" }
        )
      )
    );

    return;
  }

  // CONTINUOUS: single all-day event across range
  const when = buildWhenFromJobOrShift(job);

  const body = {
    ...common,
    ...when,
  };

  await upsertEvent(accessToken, body, String(job.id), undefined, timeMin, timeMax);
}

/**
 * Public: Delete ALL Google events for a job
 */
export async function deleteJobFromGoogle(jobId: string, accessToken: string) {
  if (!accessToken || !jobId) return;

  const min = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
  const max = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 2).toISOString();

  const events = await listEventsByJobId(accessToken, String(jobId), min, max);

  await Promise.allSettled(
    events.map((ev: any) =>
      gcalFetch(
        accessToken,
        `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(String(ev.id || ""))}`,
        { method: "DELETE" }
      )
    )
  );
}