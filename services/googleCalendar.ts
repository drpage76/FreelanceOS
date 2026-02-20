// src/services/googleCalendar.ts
import { Job, SchedulingType } from "../types";

const CAL_ID = "primary";
const FO_JOB_KEY = "foJobId";

function addDays(dateISO: string, days: number) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

  // Some delete endpoints return empty body
  if (res.status === 204) return null;
  return res.json();
}

/**
 * ✅ Exported because App.tsx imports it.
 * Fetch events from the user's primary calendar.
 * If you pass timeMin/timeMax (ISO strings), it will filter by range.
 */
export async function fetchGoogleEvents(
  accessToken: string,
  opts?: {
    timeMin?: string; // ISO
    timeMax?: string; // ISO
    q?: string;
    maxResults?: number;
    showDeleted?: boolean;
    singleEvents?: boolean;
    orderBy?: "startTime" | "updated";
  }
) {
  if (!accessToken) throw new Error("Missing Google access token.");

  const params = new URLSearchParams({
    singleEvents: String(opts?.singleEvents ?? true),
    showDeleted: String(opts?.showDeleted ?? false),
    orderBy: opts?.orderBy ?? "startTime",
    maxResults: String(opts?.maxResults ?? 2500),
  });

  if (opts?.timeMin) params.set("timeMin", opts.timeMin);
  if (opts?.timeMax) params.set("timeMax", opts.timeMax);
  if (opts?.q) params.set("q", opts.q);

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events?${params.toString()}`;
  const data = await gcalFetch(url, accessToken);
  return (data?.items || []) as any[];
}

/**
 * Optional helper: fetch ONLY FreelanceOS-tagged events (those with private extended property key).
 * Handy for debugging why deletes aren’t finding events.
 */
export async function fetchFOEvents(
  accessToken: string,
  opts?: { maxResults?: number; showDeleted?: boolean }
) {
  if (!accessToken) throw new Error("Missing Google access token.");

  // Note: Google doesn't support "exists" query for privateExtendedProperty,
  // so this fetches all events and filters client-side.
  const items = await fetchGoogleEvents(accessToken, {
    maxResults: opts?.maxResults ?? 2500,
    showDeleted: opts?.showDeleted ?? false,
    singleEvents: true,
    orderBy: "updated",
  });

  return items.filter((ev: any) => ev?.extendedProperties?.private?.[FO_JOB_KEY]);
}

async function listEventsByJobId(jobId: string, accessToken: string) {
  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "2500",
    privateExtendedProperty: `${FO_JOB_KEY}=${jobId}`,
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events?${params.toString()}`;
  const data = await gcalFetch(url, accessToken);
  return (data?.items || []) as any[];
}

async function deleteEventsByJobId(jobId: string, accessToken: string) {
  const events = await listEventsByJobId(jobId, accessToken);
  for (const ev of events) {
    const eid = ev?.id;
    if (!eid) continue;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events/${encodeURIComponent(eid)}`;
    await gcalFetch(url, accessToken, { method: "DELETE" });
  }
}

function buildContinuousEvent(job: Job, clientName?: string) {
  // All-day event: end date is exclusive in Google
  const start = { date: job.startDate };
  const end = { date: addDays(job.endDate, 1) };

  const summary = clientName ? `${clientName} — ${job.description}` : job.description;

  return {
    summary,
    description: `FreelanceOS Job\nID: ${job.id}\nLocation: ${job.location || ""}\nPO: ${job.poNumber || ""}`,
    location: job.location || undefined,
    start,
    end,
    extendedProperties: {
      private: {
        [FO_JOB_KEY]: job.id,
      },
    },
  };
}

function buildShiftEvent(job: Job, shift: any, clientName?: string) {
  const summary = clientName
    ? `${clientName} — ${shift.title || job.description}`
    : (shift.title || job.description);

  // Date-only events. (If you later add times, we can switch to dateTime.)
  const start = { date: shift.startDate || job.startDate };
  const end = { date: addDays(shift.endDate || shift.startDate || job.startDate, 1) };

  return {
    summary,
    description: `FreelanceOS Job Shift\nJob ID: ${job.id}\nShift: ${shift.title || ""}\nLocation: ${job.location || ""}\nPO: ${job.poNumber || ""}`,
    location: job.location || undefined,
    start,
    end,
    extendedProperties: {
      private: {
        [FO_JOB_KEY]: job.id,
        foShiftId: shift.id || "",
      },
    },
  };
}

/**
 * Upserts job into Google Calendar.
 * - If syncToCalendar is false, caller should call deleteJobFromGoogle instead.
 * - Continuous jobs: update existing first match, else create new.
 * - Shift-based: delete and recreate shifts (simple + reliable).
 */
export async function syncJobToGoogle(job: Job, accessToken: string, clientName?: string) {
  if (!accessToken) throw new Error("Missing Google access token.");
  if (!job?.id) throw new Error("Missing job id.");

  // If shift-based, simplest reliable behaviour: wipe & recreate
  if (job.schedulingType === SchedulingType.SHIFT_BASED) {
    await deleteEventsByJobId(job.id, accessToken);

    const shifts = (job.shifts || []).length ? (job.shifts || []) : [];
    for (const s of shifts) {
      const body = buildShiftEvent(job, s, clientName);
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;
      await gcalFetch(url, accessToken, { method: "POST", body: JSON.stringify(body) });
    }
    return;
  }

  // Continuous: try update first, else create
  const existing = await listEventsByJobId(job.id, accessToken);
  const body = buildContinuousEvent(job, clientName);

  if (existing.length > 0 && existing[0]?.id) {
    const eid = existing[0].id;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events/${encodeURIComponent(eid)}`;
    await gcalFetch(url, accessToken, { method: "PATCH", body: JSON.stringify(body) });
  } else {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;
    await gcalFetch(url, accessToken, { method: "POST", body: JSON.stringify(body) });
  }
}

export async function deleteJobFromGoogle(jobId: string, accessToken: string) {
  if (!accessToken) throw new Error("Missing Google access token.");
  if (!jobId) throw new Error("Missing job id.");

  await deleteEventsByJobId(jobId, accessToken);
}