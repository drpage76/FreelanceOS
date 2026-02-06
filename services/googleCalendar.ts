
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
    if (!response.ok) {
      if (response.status === 401) console.warn("Google Calendar access token expired or invalid.");
      return [];
    }
    const data = await response.json();
    return (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary || 'Untitled Event',
      startDate: format(parseISO(item.start?.dateTime || item.start?.date), 'yyyy-MM-dd'),
      endDate: format(parseISO(item.end?.dateTime || item.end?.date), 'yyyy-MM-dd'),
      source: 'google',
      link: item.htmlLink,
      color: item.colorId ? '#6366f1' : '#6366f1'
    }));
  } catch (err) { 
    console.error("Fetch Google Events error:", err);
    return []; 
  }
};

const deleteExistingEvents = async (jobId: string, accessToken: string) => {
  try {
    // We search for the exact reference string to be precise
    const query = encodeURIComponent(`(Ref: ${jobId})`);
    const search = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${query}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!search.ok) return;
    
    const data = await search.json();
    // Double check the items to ensure we only delete events related to this job ID
    const matches = (data.items || []).filter((ev: any) => 
      (ev.summary && ev.summary.includes(jobId)) || 
      (ev.description && ev.description.includes(jobId))
    );

    for (const ev of matches) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
    }
  } catch (err) {
    console.error("Google Calendar Cleanup Error:", err);
  }
};

export const syncJobToGoogle = async (job: Job, accessToken?: string, clientName?: string): Promise<boolean> => {
  if (!accessToken) {
    console.warn("Sync attempted without Google access token.");
    return false;
  }
  
  try {
    // 1. Clean up existing events for this job ID
    await deleteExistingEvents(job.id, accessToken);
    
    // 2. If job is cancelled or sync is disabled, we stop after cleaning
    if (job.status === JobStatus.CANCELLED || job.syncToCalendar === false) return true;

    const eventsToCreate = [];
    const colorId = STATUS_TO_GOOGLE_COLOR[job.status] || '1';
    const clientPrefix = clientName ? `${clientName}: ` : '';

    if (job.schedulingType === SchedulingType.SHIFT_BASED && job.shifts && job.shifts.length > 0) {
      for (const shift of job.shifts) {
        const summary = `[${job.status.toUpperCase()}] ${clientPrefix}${shift.title || 'Shift'} (Ref: ${job.id})`;
        const event: any = {
          summary,
          location: job.location,
          description: `Internal Project Reference: ${job.id}\nShift: ${shift.title || 'Untitled'}\nClient: ${clientName || 'Unknown'}`,
          colorId
        };

        if (shift.isFullDay) {
          event.start = { date: shift.startDate };
          // Google Calendar end dates for all-day events are exclusive, so add 1 day
          event.end = { date: format(addDays(parseISO(shift.endDate || shift.startDate), 1), 'yyyy-MM-dd') };
        } else {
          event.start = { dateTime: `${shift.startDate}T${shift.startTime || '09:00'}:00Z` };
          event.end = { dateTime: `${shift.endDate || shift.startDate}T${shift.endTime || '17:30'}:00Z` };
        }
        eventsToCreate.push(event);
      }
    } else {
      const summary = `[${job.status.toUpperCase()}] ${clientPrefix}${job.description} (Ref: ${job.id})`;
      eventsToCreate.push({
        summary,
        location: job.location,
        description: `Internal Project Reference: ${job.id}\nClient: ${clientName || 'Unknown'}`,
        start: { date: job.startDate },
        // Google Calendar end dates for all-day events are exclusive
        end: { date: format(addDays(parseISO(job.endDate || job.startDate), 1), 'yyyy-MM-dd') },
        colorId,
        transparency: job.status === JobStatus.CONFIRMED ? 'opaque' : 'transparent'
      });
    }

    for (const body of eventsToCreate) {
      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const errData = await resp.json();
        console.error("Google Calendar API POST Error:", errData);
      }
    }
    return true;
  } catch (err) { 
    console.error("Google Sync Exception:", err);
    return false; 
  }
};

export const deleteJobFromGoogle = async (jobId: string, accessToken?: string): Promise<boolean> => {
  if (!accessToken) return false;
  try {
    await deleteExistingEvents(jobId, accessToken);
    return true;
  } catch (err) { 
    console.error("Google Delete error:", err);
    return false; 
  }
};
