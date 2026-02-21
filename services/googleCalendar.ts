// src/services/googleCalendar.ts
import { Job, JobStatus, SchedulingType, JobShift } from "../types";

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
  // dateStr expected: YYYY-MM-DD
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
 * Map your statuses to Google colorIds (string "1".."11")
 * Feel free to tweak these.
 */
function statusToColorId(status: JobStatus): string {
  switch (status) {
    case JobStatus.CONFIRMED:
      return "10"; // green
    case JobStatus.POTENTIAL:
      return "5"; // yellow
    case JobStatus.PENCILED:
      return "6"; // orange
    case JobStatus.CANCELLED:
      return "11"; // red
    case JobStatus.AWAITING_PAYMENT:
      return "4"; // bold-ish red/orange
    case JobStatus.COMPLETED:
      return "9"; // blue
    default:
      return "1"; // default
  }
}

function buildSummary(job: Job, clientName?: string): string {
  const c = (clientName || "Client").trim();
  const j = (job.description || "Job").trim();
  return `${c} — ${j} (${job.id})`;
}

/**
 * Build an event time block.
 * - All-day events must use end.date as EXCLUSIVE => add +1 day.
 * - Timed events use dateTime with timezone.
 */
function buildWhenFromJobOrShift(job: Job, shift?: JobShift) {
  const timezone = tz();

  const startDate = (shift?.startDate || job.startDate || "").trim();
  const endDate = (shift?.endDate || shift?.startDate || job.endDate || startDate || "").trim();

  const isFullDay = shift ? (shift as any).isFullDay !== false : true;

  if (!startDate) {
    throw new Error("Calendar: missing start date");
  }

  if (isFullDay) {
    // End date is exclusive for all-day events => add +1 day
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
 * Upsert (create or update) a single event identified by:
 * - freelanceosJobId
 * - freelanceosShiftId (optional)
 *
 * We never send `id` on insert. We PATCH by Google’s real event.id.
 */
async function upsertEvent(accessToken: string, body: any, jobId: string, shiftId?: string, timeMin?: string, timeMax?: string) {
  const safeMin = timeMin || new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();
  const safeMax = timeMax || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();

  const existing = await listEventsByJobId(accessToken, jobId, safeMin, safeMax);

  const matching = existing.filter((ev: any) => {
    const priv = ev?.extendedProperties?.private || {};
    if (priv.freelanceosJobId !== jobId) return false;
    if (shiftId) return priv.freelanceosShiftId === shiftId;
    // For continuous job event: match those WITHOUT a shift id
    return !priv.freelanceosShiftId;
  });

  // If duplicates exist, keep the first and delete the rest
  if (matching.length > 1) {
    const extras = matching.slice(1);
    await Promise.allSettled(
      extras.map((ev: any) =>
        gcalFetch(accessToken, `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(ev.id)}`, {
          method: "DELETE",
        })
      )
    );
  }

  const target = matching[0];

  if (target?.id) {
    // PATCH update (safer than PUT)
    const url = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(target.id)}`;
    await gcalFetch(accessToken, url, { method: "PATCH", body: JSON.stringify(body) });
    return target.id;
  }

  // INSERT
  const insertUrl = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const res = await gcalFetch(accessToken, insertUrl, { method: "POST", body: JSON.stringify(body) });
  const created = await res.json();
  return created?.id;
}

/**
 * Public: Sync a job to Google Calendar
 */
export async function syncJobToGoogle(job: Job, accessToken: string, clientName?: string) {
  if (!accessToken) return;
  if (!job?.id) throw new Error("Calendar: missing job id");
  if (job.status === JobStatus.CANCELLED) {
    // optional: if cancelled, ensure removed
    await deleteJobFromGoogle(job.id, accessToken);
    return;
  }

  // Determine date range for lookups
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

  if (job.schedulingType === SchedulingType.SHIFT_BASED && shifts.length) {
    // Create/update per shift
    // Also clean up any old "continuous" event for this job (no shift id)
    const allExisting = await listEventsByJobId(accessToken, String(job.id), timeMin, timeMax);
    const continuous = allExisting.filter((ev: any) => {
      const priv = ev?.extendedProperties?.private || {};
      return priv.freelanceosJobId === String(job.id) && !priv.freelanceosShiftId;
    });

    await Promise.allSettled(
      continuous.map((ev: any) =>
        gcalFetch(accessToken, `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(ev.id)}`, {
          method: "DELETE",
        })
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

    // Remove any events for shifts that no longer exist (cleanup duplicates / stale shifts)
    const refreshed = await listEventsByJobId(accessToken, String(job.id), timeMin, timeMax);
    const validShiftIds = new Set(shifts.map((s: any) => String(s.id)));
    const stale = refreshed.filter((ev: any) => {
      const priv = ev?.extendedProperties?.private || {};
      const sid = priv.freelanceosShiftId;
      return sid && !validShiftIds.has(String(sid));
    });

    await Promise.allSettled(
      stale.map((ev: any) =>
        gcalFetch(accessToken, `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(ev.id)}`, {
          method: "DELETE",
        })
      )
    );

    return;
  }

  // Continuous (single all-day event over job range)
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

  // Wide range: 2 years back/forward to ensure we catch everything
  const min = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
  const max = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 2).toISOString();

  const events = await listEventsByJobId(accessToken, String(jobId), min, max);
  await Promise.allSettled(
    events.map((ev: any) =>
      gcalFetch(accessToken, `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(ev.id)}`, {
        method: "DELETE",
      })
    )
  );
}