// src/services/googleCalendar.ts
import { Job, JobStatus, SchedulingType } from "../types";

const CAL_ID = "primary";
const FO_JOB_KEY = "foJobId";
const FO_APP_MARKER = "FreelanceOS";

function addDays(dateISO: string, days: number) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function sanitizeEventId(id: string) {
  // Google event id rules: use a-z0-9 and underscores, keep reasonable length
  return ("fo_" + String(id || ""))
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 100);
}

function statusToColorId(status?: JobStatus | string) {
  // Google Calendar colorId values 1-11 (varies by account theme, but ids are stable)
  // We'll use: red=11, yellow/orange=6/5, green=10, blue=9
  const s = String(status || "").toUpperCase();
  if (s === "POTENTIAL") return "11";     // red
  if (s === "PENCILLED") return "6";      // orange/yellow
  if (s === "CONFIRMED") return "10";     // green
  if (s === "COMPLETED") return "9";      // blue
  if (s === "CANCELLED") return "8";      // grey-ish
  return "9";
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

function hasOurMarker(ev: any, jobId: string) {
  const desc = String(ev?.description || "");
  const hasJobIdText =
    desc.includes(`ID: ${jobId}`) ||
    desc.includes(`Job ID: ${jobId}`) ||
    desc.includes(`${FO_JOB_KEY}: ${jobId}`) ||
    desc.includes(`(${jobId})`) ||
    desc.includes(jobId);

  const hasAppMarker = desc.includes(FO_APP_MARKER);
  const hasProp = ev?.extendedProperties?.private?.[FO_JOB_KEY] === jobId;
  return hasProp || (hasAppMarker && hasJobIdText);
}

async function listLikelyJobEvents(jobId: string, accessToken: string) {
  // Try the strongest filter first (extended property)
  const params1 = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "2500",
    privateExtendedProperty: `${FO_JOB_KEY}=${jobId}`,
  });

  const url1 = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events?${params1.toString()}`;
  const d1 = await gcalFetch(url1, accessToken);
  const items1 = (d1?.items || []) as any[];

  // Also search by jobId text to find legacy events (duplicates) created before we tagged them
  const params2 = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "2500",
    q: jobId,
  });

  const url2 = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events?${params2.toString()}`;
  const d2 = await gcalFetch(url2, accessToken);
  const items2 = (d2?.items || []) as any[];

  // Merge + filter safely
  const map = new Map<string, any>();
  [...items1, ...items2].forEach((ev) => {
    if (ev?.id) map.set(ev.id, ev);
  });

  return Array.from(map.values()).filter((ev) => hasOurMarker(ev, jobId));
}

async function deleteEvents(events: any[], accessToken: string) {
  for (const ev of events) {
    const eid = ev?.id;
    if (!eid) continue;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events/${encodeURIComponent(eid)}`;
    await gcalFetch(url, accessToken, { method: "DELETE" });
  }
}

function buildContinuousEvent(job: Job, clientName?: string) {
  // Google all-day: end is exclusive -> add 1 day to inclusive endDate
  const start = { date: job.startDate };
  const end = { date: addDays(job.endDate, 1) };

  const base = clientName ? `${clientName} — ${job.description}` : job.description;
  const summary = `${base} (${job.id})`;

  return {
    summary,
    colorId: statusToColorId(job.status as any),
    description:
      `${FO_APP_MARKER} Job\n` +
      `ID: ${job.id}\n` +
      `Status: ${job.status}\n` +
      `Location: ${job.location || ""}\n` +
      `PO: ${job.poNumber || ""}`,
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
  const base = clientName ? `${clientName} — ${shift.title || job.description}` : shift.title || job.description;
  const summary = `${base} (${job.id})`;

  // If later you store times, you can switch to dateTime.
  // For now we keep all-day for shifts too, inclusive end -> +1 day
  const startDate = shift.startDate || job.startDate;
  const endDate = shift.endDate || shift.startDate || job.startDate;

  return {
    summary,
    colorId: statusToColorId(job.status as any),
    description:
      `${FO_APP_MARKER} Job Shift\n` +
      `Job ID: ${job.id}\n` +
      `Shift: ${shift.title || ""}\n` +
      `Status: ${job.status}\n` +
      `Location: ${job.location || ""}\n` +
      `PO: ${job.poNumber || ""}`,
    location: job.location || undefined,
    start: { date: startDate },
    end: { date: addDays(endDate, 1) },
    extendedProperties: {
      private: {
        [FO_JOB_KEY]: job.id,
        foShiftId: shift.id || "",
      },
    },
  };
}

/**
 * ✅ Public: fetch events for dashboard overlay (safe range, prevents timeRangeEmpty)
 */
export async function fetchGoogleEvents(_tenantId: string, accessToken: string) {
  if (!accessToken) return [];

  const now = new Date();
  const timeMin = new Date(now.getFullYear() - 1, 0, 1).toISOString();
  const timeMax = new Date(now.getFullYear() + 2, 11, 31, 23, 59, 59).toISOString();

  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "2500",
    timeMin,
    timeMax,
    orderBy: "startTime",
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events?${params.toString()}`;
  const data = await gcalFetch(url, accessToken);
  return (data?.items || []) as any[];
}

/**
 * ✅ Upsert job into Google Calendar, and remove duplicates from legacy sync.
 */
export async function syncJobToGoogle(job: Job, accessToken: string, clientName?: string) {
  if (!accessToken) throw new Error("Missing Google access token.");
  if (!job?.id) throw new Error("Missing job id.");

  const jobEventId = sanitizeEventId(job.id);

  // 1) Clean up legacy duplicates for this job (events we previously created but can’t “update” reliably)
  // We keep the deterministic id event and remove other matching ones.
  const likely = await listLikelyJobEvents(job.id, accessToken);
  const legacyDuplicates = likely.filter((ev) => ev?.id && ev.id !== jobEventId && !String(ev.id).includes("_" + sanitizeEventId(job.id)));
  if (legacyDuplicates.length) {
    await deleteEvents(legacyDuplicates, accessToken);
  }

  // 2) Shift-based: delete all shift events for this job, then recreate deterministically per shift
  if (job.schedulingType === SchedulingType.SHIFT_BASED) {
    // delete any existing for this job (including deterministic continuous event)
    const existing = await listLikelyJobEvents(job.id, accessToken);
    await deleteEvents(existing, accessToken);

    const shifts = (job.shifts || []).length ? (job.shifts || []) : [];
    for (const s of shifts) {
      const shiftEventId = sanitizeEventId(`${job.id}_${s.id || "shift"}`);
      const body = { id: shiftEventId, ...buildShiftEvent(job, s, clientName) };
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;
      await gcalFetch(url, accessToken, { method: "POST", body: JSON.stringify(body) });
    }
    return;
  }

  // 3) Continuous: create/update one stable event id
  const body = { id: jobEventId, ...buildContinuousEvent(job, clientName) };

  // Try create first. If it already exists, PATCH it.
  const insertUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;
  try {
    await gcalFetch(insertUrl, accessToken, { method: "POST", body: JSON.stringify(body) });
  } catch (e: any) {
    // 409 = already exists
    if (String(e?.message || "").includes("409")) {
      const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events/${encodeURIComponent(jobEventId)}`;
      await gcalFetch(patchUrl, accessToken, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      throw e;
    }
  }
}

export async function deleteJobFromGoogle(jobId: string, accessToken: string) {
  if (!accessToken) throw new Error("Missing Google access token.");
  if (!jobId) throw new Error("Missing job id.");

  const existing = await listLikelyJobEvents(jobId, accessToken);
  await deleteEvents(existing, accessToken);

  // Also attempt deterministic delete in case it exists but didn't match our filters
  const deterministic = sanitizeEventId(jobId);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events/${encodeURIComponent(deterministic)}`;
  try {
    await gcalFetch(url, accessToken, { method: "DELETE" });
  } catch {
    // ignore
  }
}