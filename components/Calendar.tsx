
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { 
  format, isSameMonth, isSameDay, addMonths, subMonths, 
  parseISO, differenceInDays, startOfDay, endOfDay,
  parse, isValid, subDays
} from 'date-fns';
import { Job, JobStatus, ExternalEvent, Client, SchedulingType } from '../types';
import { getCalendarDays } from '../utils';

interface CalendarProps {
  jobs: Job[];
  externalEvents: ExternalEvent[];
  clients: Client[];
}

export const Calendar: React.FC<CalendarProps> = ({ jobs, externalEvents, clients }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const navigate = useNavigate();
  const days = getCalendarDays(currentDate);

  const weeks = useMemo(() => {
    const weeksList: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) weeksList.push(days.slice(i, i + 7));
    return weeksList;
  }, [days]);

  const allCalendarEntries = useMemo(() => {
    const entries: any[] = [];
    const internalJobIds = new Set((jobs || []).map(j => j.id));
    
    (jobs || []).forEach(job => {
      // Respect the syncToCalendar flag for internal display too
      if (job.syncToCalendar === false) return;

      const client = clients.find(c => c.id === job.clientId);
      const clientName = client?.name || 'Unknown';
      const locationLabel = job.location ? ` @ ${job.location}` : '';
      const statusPrefix = `[${job.status.toUpperCase()}] #${job.id}`;
      
      if (job.schedulingType === SchedulingType.SHIFT_BASED) {
        if (job.shifts && job.shifts.length > 0) {
          job.shifts.forEach(shift => {
            const sDate = shift.startDate ? parseISO(shift.startDate) : null;
            if (!sDate || !isValid(sDate)) return;
            
            entries.push({
              id: shift.id,
              jobId: job.id,
              title: `${statusPrefix} | ${clientName}: ${shift.title || 'Shift'}${locationLabel}`,
              startDate: shift.startDate,
              endDate: shift.endDate || shift.startDate,
              type: 'shift',
              status: job.status,
              timeLabel: shift.isFullDay ? 'Full Day' : `${shift.startTime || '09:00'} - ${shift.endTime || '17:30'}`
            });
          });
        }
      } else {
        const sDate = job.startDate ? parseISO(job.startDate) : null;
        if (!sDate || !isValid(sDate)) return;
        
        entries.push({
          id: job.id,
          jobId: job.id,
          title: `${statusPrefix} | ${clientName}: ${job.description}${locationLabel}`,
          startDate: job.startDate,
          endDate: job.endDate || job.startDate,
          type: 'job',
          status: job.status
        });
      }
    });

    (externalEvents || []).forEach(e => {
      // Improved De-duplication: Check for ID starting with # in title
      const idInTitleMatch = e.title.match(/#(\d+)/);
      if (idInTitleMatch && internalJobIds.has(idInTitleMatch[1])) {
        return; 
      }

      const sDate = e.startDate ? parseISO(e.startDate) : null;
      if (sDate && isValid(sDate)) {
        let endDate = e.endDate;
        if (e.source === 'google' && e.startDate !== e.endDate) {
          const endISO = parseISO(e.endDate);
          if (isValid(endISO)) {
            endDate = format(subDays(endISO, 1), 'yyyy-MM-dd');
          }
        }
        entries.push({ ...e, endDate, type: 'external' });
      }
    });

    return entries.sort((a, b) => {
      const dateA = parseISO(a.startDate);
      const dateB = parseISO(b.startDate);
      return (isValid(dateA) ? dateA.getTime() : 0) - (isValid(dateB) ? dateB.getTime() : 0);
    });
  }, [jobs, externalEvents, clients]);

  const getStatusColor = (status?: JobStatus, type?: string, color?: string) => {
    if (type === 'external') return color || '#6366f1';
    switch(status) {
      case JobStatus.CONFIRMED: return '#10b981';
      case JobStatus.AWAITING_PAYMENT: return '#06b6d4';
      case JobStatus.COMPLETED: return '#10b981';
      case JobStatus.PENCILLED: return '#f59e0b';
      case JobStatus.POTENTIAL: return '#fbbf24';
      default: return '#94a3b8';
    }
  };

  const handleEntryClick = (entry: any) => {
    if (entry.link) {
      window.open(entry.link, '_blank');
      return;
    }
    if (entry.jobId) {
      navigate(`/jobs/${entry.jobId}`);
    }
  };

  return (
    <div className="bg-white rounded-[40px] overflow-hidden flex flex-col h-auto">
      <div className="px-4 sm:px-8 py-6 flex flex-wrap items-center justify-between bg-white border-b border-slate-100 gap-4">
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-3">
             <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight whitespace-nowrap">
               {format(currentDate, 'MMMM yyyy')}
             </h3>
             <div className="relative overflow-hidden w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-200 group cursor-pointer transition-all hover:border-indigo-400">
                <i className="fa-solid fa-calendar-day text-[14px] text-slate-400 group-hover:text-indigo-600"></i>
                <input 
                  type="month" 
                  onChange={e => e.target.value && setCurrentDate(parse(`${e.target.value}-01`, 'yyyy-MM-dd', new Date()))} 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  title="Jump to date"
                />
             </div>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-[16px] border border-slate-200 shadow-inner">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-white rounded-lg text-slate-400 transition-all"><i className="fa-solid fa-chevron-left text-xs"></i></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 sm:px-6 py-1 bg-indigo-600 text-white rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest mx-1 sm:mx-2 shadow-sm">Today</button>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-white rounded-lg text-slate-400 transition-all"><i className="fa-solid fa-chevron-right text-xs"></i></button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 bg-slate-50/30 border-b border-slate-100">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{day}</div>
        ))}
      </div>

      <div className="flex-1">
        {weeks.map((week, wIdx) => {
          const weekStart = startOfDay(week[0]), weekEnd = endOfDay(week[6]);
          const weekEntries = allCalendarEntries.filter(e => {
            const s = parseISO(e.startDate);
            const end = parseISO(e.endDate);
            if (!isValid(s) || !isValid(end)) return false;
            return startOfDay(s) <= weekEnd && endOfDay(end) >= weekStart;
          });

          const lanes: any[][] = [];
          weekEntries.forEach(entry => {
            const sISO = parseISO(entry.startDate);
            const eISO = parseISO(entry.endDate);
            const s = startOfDay(isValid(sISO) ? sISO : weekStart);
            const e = endOfDay(isValid(eISO) ? eISO : weekEnd);
            const viewStart = Math.max(s.getTime(), weekStart.getTime());
            const viewEnd = Math.min(e.getTime(), weekEnd.getTime());

            let l = 0;
            while (lanes[l]) {
              const hasCollision = lanes[l].some(le => {
                const lesISO = parseISO(le.startDate);
                const leeISO = parseISO(le.endDate);
                const les = startOfDay(isValid(lesISO) ? lesISO : weekStart);
                const lee = endOfDay(isValid(leeISO) ? leeISO : weekEnd);
                const leViewStart = Math.max(les.getTime(), weekStart.getTime());
                const leViewEnd = Math.min(lee.getTime(), weekEnd.getTime());
                return Math.max(viewStart, leViewStart) <= Math.min(viewEnd, leViewEnd);
              });
              if (!hasCollision) break;
              l++;
            }
            if (!lanes[l]) lanes[l] = [];
            lanes[l].push(entry);
          });

          return (
            <div key={wIdx} className="relative min-h-[120px] border-b border-slate-50 last:border-b-0">
              <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                {week.map((day, dIdx) => (
                  <div key={dIdx} className={`border-r border-slate-50 flex flex-col p-2 ${!isSameMonth(day, currentDate) ? 'bg-slate-50/10' : ''}`}>
                    <span className={`text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-lg ${isSameDay(day, new Date()) ? 'bg-indigo-600 text-white shadow-md' : isSameMonth(day, currentDate) ? 'text-slate-900' : 'text-slate-200'}`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                ))}
              </div>

              <div className="relative pt-10 pb-2 px-1 space-y-1">
                {lanes.map((lane, lIdx) => (
                  <div key={lIdx} className="grid grid-cols-7 gap-1 h-6 relative">
                    {week.map((day, dIdx) => {
                      const entry = lane.find(e => {
                        const sISO = parseISO(e.startDate);
                        if (!isValid(sISO)) return false;
                        const s = startOfDay(sISO);
                        const eISO = parseISO(e.endDate);
                        const end = isValid(eISO) ? endOfDay(eISO) : s;
                        const startPoint = s < weekStart ? weekStart : s;
                        return isSameDay(day, startPoint) && day <= end;
                      });
                      
                      if (!entry) return <div key={dIdx} />;
                      
                      const sISO = parseISO(entry.startDate);
                      const eISO = parseISO(entry.endDate);
                      const s = startOfDay(isValid(sISO) ? sISO : day);
                      const end = endOfDay(isValid(eISO) ? eISO : day);
                      const offset = Math.max(0, differenceInDays(s, weekStart));
                      const eventEndInWeek = end > weekEnd ? weekEnd : end;
                      const eventStartInWeek = s < weekStart ? weekStart : s;
                      const duration = Math.max(1, differenceInDays(eventEndInWeek, eventStartInWeek) + 1);

                      const bgColor = getStatusColor(entry.status, entry.type, entry.color);
                      const textColor = (bgColor === '#fbbf24' || bgColor === '#f59e0b') ? 'text-slate-900' : 'text-white';

                      return (
                        <div 
                          key={`${entry.id}-${wIdx}`}
                          onClick={() => handleEntryClick(entry)}
                          style={{ gridColumn: `${offset + 1} / span ${duration}`, backgroundColor: bgColor }}
                          className={`h-5 rounded-lg shadow-sm flex items-center px-3 z-10 transition-all hover:brightness-105 hover:scale-[1.01] cursor-pointer ${textColor}`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden w-full">
                            {entry.type === 'external' && <i className="fa-brands fa-google text-[7px] opacity-70"></i>}
                            <span className="text-[8px] font-black uppercase tracking-tight whitespace-nowrap overflow-hidden">
                              {entry.timeLabel ? `${entry.timeLabel} • ` : ''}{entry.title}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
