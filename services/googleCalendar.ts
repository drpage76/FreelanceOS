// src/services/googleCalendar.ts
import { Job, SchedulingType } from "../types";

const CAL_ID = "primary";
const FO_JOB_KEY = "foJobId";

/**
 * Google Calendar colorId reference (common defaults):
 * 11 = red, 5 = yellow, 10 = green, 9 = blue, 8 = grey
 * If your account uses different colors, we can adjust later.
 */
function getColorIdForStatus(status?: string): string | undefined {
  const s = (status || "").toLowerCase();

  if (s.includes("potential")) return "11"; // red
  if (s.includes("pencilled") || s.includes("penciled")) return "5"; // amber/yellow
  if (s.includes("confirmed")) return "10"; // green
  if (s.includes("cancel")) return "8"; // grey

  // “statuses thereafter can be blue”
  return "9"; // blue fallback
}

function addDays(dateISO: string, days: number) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getLocalTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function toRFC3339(dateISO: string, time?: string, tz?: string) {
  // If only date → return midnight UTC-ish; for dateTime events we’ll pass dateTime + timeZone
  if (!time) return new Date(dateISO + "T00:00:00Z").toISOString();
  // We keep it as local time with timeZone parameter in the event body, so for query times we use Z.
  return new Date(`${dateISO}T${time}:00Z`).toISOString();
}

async function gcalFetch(url: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Google Calendar API ${res.status}: ${text || res.statusText}`);
    (err as any).status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

/**
 * ✅ FIX for your current popup:
 * Always request events within a valid range (timeMin < timeMax, both non-empty).
 * This function is used by App.tsx during loadData().
 */
export async function fetchGoogleEvents(_userEmail: string, accessToken: string) {
  if (!accessToken) return [];

  const now = new Date();
  const min = new Date(now);
  min.setMonth(min.getMonth() - 6);

  const max = new Date(now);
  max.setMonth(max.getMonth() + 18);

  // Safety: ensure max > min
  if (max.getTime() <= min.getTime()) {
    max.setDate(min.getDate() + 1);
  }

  const timeMin = min.toISOString(); // non-empty
  const timeMax = max.toISOString(); // non-empty

  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "2500",
    orderBy: "startTime",
    timeMin,
    timeMax,
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    CAL_ID
  )}/events?${params.toString()}`;

  const data = await gcalFetch(url, accessToken);
  return (data?.items || []) as any[];
}

async function listEventsByJobId(jobId: string, accessToken: string) {
  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "2500",
    privateExtendedProperty: `${FO_JOB_KEY}=${jobId}`,
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    CAL_ID
  )}/events?${params.toString()}`;

  const data = await gcalFetch(url, accessToken);
  return (data?.items || []) as any[];
}

async function searchEventsByText(query: string, accessToken: string) {
  // Used as fallback for older duplicates that were created before we set extendedProperties
  const now = new Date();
  const min = new Date(now);
  min.setMonth(min.getMonth() - 24);
  const max = new Date(now);
  max.setMonth(max.getMonth() + 36);

  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "2500",
    q: query,
    timeMin: min.toISOString(),
    timeMax: max.toISOString(),
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    CAL_ID
  )}/events?${params.toString()}`;

  const data = await gcalFetch(url, accessToken);
  return (data?.items || []) as any[];
}

async function deleteEventById(eventId: string, accessToken: string) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    CAL_ID
  )}/events/${encodeURIComponent(eventId)}`;
  await gcalFetch(url, accessToken, { method: "DELETE" });
}

async function deleteEventsByJobId(jobId: string, accessToken: string) {
  const events = await listEventsByJobId(jobId, accessToken);
  for (const ev of events) {
    const eid = ev?.id;
    if (!eid) continue;
    await deleteEventById(eid, accessToken);
  }
}

function buildContinuousEvent(job: Job, clientName?: string) {
  const start = { date: job.startDate };
  const end = { date: addDays(job.endDate, 1) }; // end is exclusive for all-day events

  const summary = clientName ? `${clientName} — ${job.description}` : job.description;

  return {
    summary,
    description: `FreelanceOS Job\nID: ${job.id}\nStatus: ${job.status || ""}\nLocation: ${
      job.location || ""
    }\nPO: ${job.poNumber || ""}`,
    location: job.location || undefined,
    start,
    end,
    colorId: getColorIdForStatus((job as any).status),
    extendedProperties: {
      private: {
        [FO_JOB_KEY]: job.id,
      },
    },
  };
}

function buildShiftEvent(job: Job, shift: any, clientName?: string) {
  const tz = getLocalTz();

  const title = shift.title || job.description;
  const summary = clientName ? `${clientName} — ${title}` : title;

  const shiftStartDate = shift.startDate || job.startDate;
  const shiftEndDate = shift.endDate || shift.startDate || job.startDate;

  const isFullDay = shift.isFullDay !== false; // default true
  const hasTimes = !!shift.startTime && !!shift.endTime && !isFullDay;

  const start = hasTimes
    ? { dateTime: `${shiftStartDate}T${shift.startTime}:00`, timeZone: tz }
    : { date: shiftStartDate };

  // For dateTime end uses same date + endTime; for all-day end is exclusive (+1 day)
  const end = hasTimes
    ? { dateTime: `${shiftEndDate}T${shift.endTime}:00`, timeZone: tz }
    : { date: addDays(shiftEndDate, 1) };

  return {
    summary,
    description: `FreelanceOS Job Shift\nJob ID: ${job.id}\nStatus: ${job.status || ""}\nShift: ${
      shift.title || ""
    }\nLocation: ${job.location || ""}\nPO: ${job.poNumber || ""}`,
    location: job.location || undefined,
    start,
    end,
    colorId: getColorIdForStatus((job as any).status),
    extendedProperties: {
      private: {
        [FO_JOB_KEY]: job.id,
        foShiftId: shift.id || "",
      },
    },
  };
}

/**
 * ✅ Dedupe logic:
 * 1) find by privateExtendedProperty foJobId
 * 2) if none, fallback search by "ID: <jobId>" (old events)
 * 3) if multiple, delete extras and keep one
 */
async function getCanonicalEventForJob(jobId: string, accessToken: string) {
  let events = await listEventsByJobId(jobId, accessToken);

  if (!events.length) {
    // fallback: old events likely had ID in description but not extended props
    events = await searchEventsByText(`ID: ${jobId}`, accessToken);
  }

  // Keep only exact matches (some text searches can return false positives)
  const filtered = (events || []).filter((ev) => {
    const desc = (ev?.description || "") as string;
    const hasIdInDesc = desc.includes(`ID: ${jobId}`) || desc.includes(`Job ID: ${jobId}`);
    const hasProp = ev?.extendedProperties?.private?.[FO_JOB_KEY] === jobId;
    return hasProp || hasIdInDesc;
  });

  if (filtered.length <= 1) return filtered[0] || null;

  // If multiple, keep the first and delete the rest
  const [keep, ...extras] = filtered;
  for (const ev of extras) {
    if (ev?.id) {
      await deleteEventById(ev.id, accessToken);
    }
  }
  return keep || null;
}

/**
 * Upserts job into Google Calendar.
 * - If syncToCalendar is false, caller should call deleteJobFromGoogle instead.
 * - Continuous jobs: update existing (deduped) else create.
 * - Shift-based: wipe & recreate all shifts (and we dedupe older leftovers first).
 */
export async function syncJobToGoogle(job: Job, accessToken: string, clientName?: string) {
  if (!accessToken) throw new Error("Missing Google access token.");
  if (!job?.id) throw new Error("Missing job id.");

  // Shift-based: simplest reliable behaviour = delete all job events then recreate shifts
  if (job.schedulingType === SchedulingType.SHIFT_BASED) {
    // delete everything tagged to this job (and also dedupe old leftovers)
    await deleteEventsByJobId(job.id, accessToken);

    // also remove old “ID: jobId” events that are not tagged
    const old = await searchEventsByText(`ID: ${job.id}`, accessToken);
    for (const ev of old) {
      const desc = (ev?.description || "") as string;
      const matches = desc.includes(`ID: ${job.id}`) || desc.includes(`Job ID: ${job.id}`);
      if (matches && ev?.id) await deleteEventById(ev.id, accessToken);
    }

    const shifts = Array.isArray((job as any).shifts) ? (job as any).shifts : [];
    for (const s of shifts) {
      const body = buildShiftEvent(job, s, clientName);
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;
      await gcalFetch(url, accessToken, { method: "POST", body: JSON.stringify(body) });
    }
    return;
  }

  // Continuous: update existing canonical event, else create new
  const existing = await getCanonicalEventForJob(job.id, accessToken);
  const body = buildContinuousEvent(job, clientName);

  if (existing?.id) {
    const eid = existing.id;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      CAL_ID
    )}/events/${encodeURIComponent(eid)}`;
    await gcalFetch(url, accessToken, { method: "PATCH", body: JSON.stringify(body) });
  } else {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;
    await gcalFetch(url, accessToken, { method: "POST", body: JSON.stringify(body) });
  }
}

export async function deleteJobFromGoogle(jobId: string, accessToken: string) {
  if (!accessToken) throw new Error("Missing Google access token.");
  if (!jobId) throw new Error("Missing job id.");

  // delete tagged events
  await deleteEventsByJobId(jobId, accessToken);

  // also delete older leftovers found via text search
  const old = await searchEventsByText(`ID: ${jobId}`, accessToken);
  for (const ev of old) {
    const desc = (ev?.description || "") as string;
    const matches = desc.includes(`ID: ${jobId}`) || desc.includes(`Job ID: ${jobId}`);
    if (matches && ev?.id) await deleteEventById(ev.id, accessToken);
  }
}