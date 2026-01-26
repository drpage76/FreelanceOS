
import { ExternalEvent, Job, JobStatus, SchedulingType, JobShift } from '../types';
import { format, parseISO, addDays, subDays } from 'date-fns';

const STATUS_TO_GOOGLE_COLOR: Record<string, string> = {
  [JobStatus.CONFIRMED]: '10', // Basil (Green)
  [JobStatus.PENCILLED]: '6',  // Tangerine (Orange)
  [JobStatus.POTENTIAL]: '5',  // Banana (Yellow)
  [JobStatus.CANCELLED]: '8',  // Graphite (Grey)
};

export const fetchGoogleEvents = async (email: string, accessToken?: string): Promise<ExternalEvent[]> => {
  if (!accessToken) return [];
  try {
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 1);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&timeMin=${timeMin.toISOString()}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary || 'Untitled',
      startDate: format(parseISO(item.start?.dateTime || item.start?.date), 'yyyy-MM-dd'),
      endDate: format(parseISO(item.end?.dateTime || item.end?.date), 'yyyy-MM-dd'),
      source: 'google',
      color: item.colorId ? '#6366f1' : '#6366f1' // Simplify color mapping for brevity
    }));
  } catch { return []; }
};

const deleteExistingEvents = async (jobId: string, accessToken: string) => {
  const query = encodeURIComponent(jobId);
  const search = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${query}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const data = await search.json();
  const matches = (data.items || []).filter((ev: any) => ev.summary?.includes(jobId) || ev.description?.includes(jobId));
  for (const ev of matches) {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
  }
};

export const syncJobToGoogle = async (job: Job, accessToken?: string, clientName?: string): Promise<boolean> => {
  if (!accessToken) return false;
  try {
    await deleteExistingEvents(job.id, accessToken);
    if (job.status === JobStatus.CANCELLED) return true;

    const eventsToCreate = [];
    const colorId = STATUS_TO_GOOGLE_COLOR[job.status] || '1';

    if (job.schedulingType === SchedulingType.SHIFT_BASED && job.shifts && job.shifts.length > 0) {
      for (const shift of job.shifts) {
        const event: any = {
          summary: `[${job.status.toUpperCase()}] ${clientName ? clientName + ': ' : ''}${shift.title} (Ref: ${job.id})`,
          location: job.location,
          description: `Ref: ${job.id}\nShift: ${shift.title}\nClient: ${clientName || 'Unknown'}`,
          colorId
        };

        if (shift.isFullDay) {
          event.start = { date: shift.startDate };
          // Google all-day events are exclusive on end date
          event.end = { date: format(addDays(parseISO(shift.endDate), 1), 'yyyy-MM-dd') };
        } else {
          event.start = { dateTime: `${shift.startDate}T${shift.startTime}:00Z` };
          event.end = { dateTime: `${shift.endDate}T${shift.endTime}:00Z` };
        }
        eventsToCreate.push(event);
      }
    } else {
      eventsToCreate.push({
        summary: `[${job.status.toUpperCase()}] ${clientName ? clientName + ': ' : ''}${job.description} (Ref: ${job.id})`,
        location: job.location,
        description: `Ref: ${job.id}\nClient: ${clientName || 'Unknown'}`,
        start: { date: job.startDate },
        end: { date: format(addDays(parseISO(job.endDate), 1), 'yyyy-MM-dd') },
        colorId,
        transparency: job.status === JobStatus.CONFIRMED ? 'opaque' : 'transparent'
      });
    }

    for (const body of eventsToCreate) {
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
    return true;
  } catch { return false; }
};

export const deleteJobFromGoogle = async (jobId: string, accessToken?: string): Promise<boolean> => {
  if (!accessToken) return false;
  try {
    await deleteExistingEvents(jobId, accessToken);
    return true;
  } catch { return false; }
};
