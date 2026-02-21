// src/services/googleCalendar.ts

import { Job, JobShift, SchedulingType, JobStatus } from "../types";

// ---- helpers ----

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";
const DEFAULT_CALENDAR_ID = "primary";

// Google event IDs must match: [a-zA-Z0-9_-]{5,1024}
function safeId(raw: string): string {
  const cleaned = (raw || "")
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  // ensure length and minimum size
  const padded = cleaned.length >= 5 ? cleaned : `${cleaned}_____`.slice(0, 5);
  return padded.slice(0, 250); // keep comfortably under limits
}

function addDays(dateStr: string, days: number): string {
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function getTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  } catch {
    return "Europe/London";
  }
}

function buildJobEventId(jobId: string) {
  return safeId(`fo_job_${jobId}`);
}

function buildShiftEventId(jobId: string, shiftId: string) {
  return safeId(`fo_job_${jobId}_shift_${shiftId}`);
}

function statusColorId(status: any): string | undefined {
  // Optional: map to Google Calendar colorId (1-11). Adjust to taste.
  // If you already handle colors via calendar UI, you can return undefined.
  switch (status) {
    case "CONFIRMED":
    case JobStatus?.CONFIRMED:
      return "10"; // green-ish
    case "COMPLETED":
    case JobStatus?.COMPLETED:
      return "2"; // darker green
    case "POTENTIAL":
    case JobStatus?.POTENTIAL:
      return "5"; // yellow
    case "PENCILED":
    case JobStatus?.PENCILED:
      return "6"; // orange
    case "CANCELLED":
    case JobStatus?.CANCELLED:
      return "11"; // red
    default:
      return undefined;
  }
}

async function gcalFetch(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      `Google Calendar API error (${res.status})`;
    throw new Error(msg);
  }

  return json;
}

// Find existing events by our private extended property
async function listEventsByPrivateProp(
  accessToken: string,
  key: string,
  value: string
): Promise<any[]> {
  const calendarId = DEFAULT_CALENDAR_ID;
  const q = encodeURIComponent(`${key}=${value}`);
  // NOTE: Calendar API uses privateExtendedProperty param (can be repeated)
  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events?privateExtendedProperty=${q}&maxResults=2500&singleEvents=true`;

  const data = await gcalFetch(url, accessToken);
  return data?.items || [];
}

async function upsertEventById(
  accessToken: string,
  eventId: string,
  eventBody: any
): Promise<void> {
  const calendarId = DEFAULT_CALENDAR_ID;

  // Try update first; if 404 then insert.
  const updateUrl = `${GCAL_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;

  try {
    await gcalFetch(updateUrl, accessToken, {
      method: "PUT",
      body: JSON.stringify(eventBody),
    });
  } catch (e: any) {
    // If not found, insert with explicit ID
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("notFound".toLowerCase())) {
      const insertUrl = `${GCAL_BASE}/calendars/${encodeURIComponent(
        calendarId
      )}/events`;
      await gcalFetch(insertUrl, accessToken, {
        method: "POST",
        body: JSON.stringify({ ...eventBody, id: eventId }),
      });
      return;
    }
    throw e;
  }
}

async function deleteEventSafe(accessToken: string, eventId: string): Promise<void> {
  const calendarId = DEFAULT_CALENDAR_ID;
  if (!eventId || eventId.trim().length < 5) return; // guard
  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;
  try {
    await gcalFetch(url, accessToken, { method: "DELETE" });
  } catch {
    // ignore if already gone
  }
}

function buildSummary(clientName: string | undefined, jobTitle: string, jobId: string) {
  // you said: show company + job name, and add (JOB ID) at end
  const left = clientName ? `${clientName} — ${jobTitle}` : jobTitle;
  return `${left} (${jobId})`;
}

// Build event payloads
function buildAllDayEventPayload(opts: {
  summary: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD inclusive in your app
  description?: string;
  location?: string;
  status?: any;
  privateProps: Record<string, string>;
}) {
  const tz = getTimeZone();
  return {
    summary: opts.summary,
    location: opts.location || undefined,
    description: opts.description || undefined,
    start: { date: opts.startDate, timeZone: tz },
    // IMPORTANT: Google all-day end date is EXCLUSIVE, so +1 day
    end: { date: addDays(opts.endDate, 1), timeZone: tz },
    colorId: statusColorId(opts.status),
    extendedProperties: {
      private: opts.privateProps,
    },
  };
}

function buildTimedEventPayload(opts: {
  summary: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  description?: string;
  location?: string;
  status?: any;
  privateProps: Record<string, string>;
}) {
  const tz = getTimeZone();
  return {
    summary: opts.summary,
    location: opts.location || undefined,
    description: opts.description || undefined,
    start: { dateTime: `${opts.date}T${opts.startTime}:00`, timeZone: tz },
    end: { dateTime: `${opts.date}T${opts.endTime}:00`, timeZone: tz },
    colorId: statusColorId(opts.status),
    extendedProperties: {
      private: opts.privateProps,
    },
  };
}

// ---- public API ----

export async function syncJobToGoogle(
  job: Job,
  accessToken: string,
  clientName?: string
): Promise<void> {
  if (!accessToken) return;

  const jobId = (job as any)?.id?.toString?.() || "";
  if (!jobId) throw new Error("Job ID missing (cannot sync).");

  const summary = buildSummary(clientName, (job as any).description || "Job", jobId);

  // SHIFT-BASED: create/update one event per shift
  if ((job as any).schedulingType === SchedulingType.SHIFT_BASED) {
    const shifts: JobShift[] = (job as any).shifts || [];

    // 1) Upsert each shift event
    for (const s of shifts) {
      const shiftId = (s as any)?.id?.toString?.() || "";
      if (!shiftId) continue; // guard

      const eventId = buildShiftEventId(jobId, shiftId);

      const startDate = (s as any).startDate || (job as any).startDate;
      const endDate = (s as any).endDate || startDate;

      const isFullDay = (s as any).isFullDay !== false;

      const privateProps = {
        fo_job_id: jobId,
        fo_shift_id: shiftId,
        fo_type: "shift",
      };

      const payload = isFullDay
        ? buildAllDayEventPayload({
            summary,
            startDate,
            endDate,
            location: (job as any).location || "",
            status: (job as any).status,
            privateProps,
          })
        : buildTimedEventPayload({
            summary,
            date: startDate,
            startTime: (s as any).startTime || "09:00",
            endTime: (s as any).endTime || "17:30",
            location: (job as any).location || "",
            status: (job as any).status,
            privateProps,
          });

      await upsertEventById(accessToken, eventId, payload);

      // 2) Dedupe: if any extra events exist with same fo_shift_id, delete them
      const found = await listEventsByPrivateProp(accessToken, "fo_shift_id", shiftId);
      const keep = eventId;
      for (const ev of found) {
        const id = ev?.id;
        if (id && id !== keep) await deleteEventSafe(accessToken, id);
      }
    }

    // 3) Remove any old “job-level” event if it exists (from earlier versions)
    const jobLevelEvents = await listEventsByPrivateProp(accessToken, "fo_job_id", jobId);
    for (const ev of jobLevelEvents) {
      const isShift = ev?.extendedProperties?.private?.fo_type === "shift";
      if (!isShift && ev?.id) await deleteEventSafe(accessToken, ev.id);
    }

    return;
  }

  // CONTINUOUS (or default): one all-day event for the job
  const eventId = buildJobEventId(jobId);

  const privateProps = {
    fo_job_id: jobId,
    fo_type: "job",
  };

  const payload = buildAllDayEventPayload({
    summary,
    startDate: (job as any).startDate,
    endDate: (job as any).endDate,
    location: (job as any).location || "",
    status: (job as any).status,
    privateProps,
  });

  await upsertEventById(accessToken, eventId, payload);

  // Dedupe: delete any other job-level events for this job
  const found = await listEventsByPrivateProp(accessToken, "fo_job_id", jobId);
  for (const ev of found) {
    const isJob = ev?.extendedProperties?.private?.fo_type === "job";
    if (!isJob) continue;
    const id = ev?.id;
    if (id && id !== eventId) await deleteEventSafe(accessToken, id);
  }

  // Also remove any shift events if user switched back to continuous
  for (const ev of found) {
    const isShift = ev?.extendedProperties?.private?.fo_type === "shift";
    if (isShift && ev?.id) await deleteEventSafe(accessToken, ev.id);
  }
}

export async function deleteJobFromGoogle(jobIdRaw: string, accessToken: string): Promise<void> {
  if (!accessToken) return;
  const jobId = (jobIdRaw || "").toString();
  if (!jobId) return;

  // delete any events tagged with this job id
  const found = await listEventsByPrivateProp(accessToken, "fo_job_id", jobId);
  for (const ev of found) {
    if (ev?.id) await deleteEventSafe(accessToken, ev.id);
  }

  // also attempt deterministic ids (in case extended props missing)
  await deleteEventSafe(accessToken, buildJobEventId(jobId));
}