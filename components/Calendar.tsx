
import React, { useState, useMemo } from 'react';
// Fix: Use namespace import for react-router-dom to resolve exported member errors
import * as ReactRouterDOM from 'react-router-dom';

const { useNavigate } = ReactRouterDOM;

import { 
  format, isSameMonth, isSameDay, addMonths, subMonths, 
  parseISO, differenceInDays, startOfDay, endOfDay,
  parse, isValid
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
    
    (jobs || []).forEach(job => {
      const client = clients.find(c => c.id === job.clientId);
      const clientName = client?.name || 'Unknown';
      const locationLabel = job.location ? ` @ ${job.location}` : '';
      
      if (job.schedulingType === SchedulingType.SHIFT_BASED) {
        if (job.shifts && job.shifts.length > 0) {
          job.shifts.forEach(shift => {
            const sDate = shift.startDate ? parseISO(shift.startDate) : null;
            if (!sDate || !isValid(sDate)) return;
            
            entries.push({
              id: shift.id,
              jobId: job.id,
              title: `${clientName}: ${shift.title || 'Shift'}${locationLabel}`,
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
          title: `${clientName}: ${job.description}${locationLabel}`,
          startDate: job.startDate,
          endDate: job.endDate || job.startDate,
          type: 'job',
          status: job.status
        });
      }
    });

    (externalEvents || []).forEach(e => {
      const sDate = e.startDate ? parseISO(e.startDate) : null;
      if (sDate && isValid(sDate)) {
        entries.push({ ...e, type: 'external' });
      }
    });

    return entries.sort((a, b) => {
      const dateA = parseISO(a.startDate);
      const dateB = parseISO(b.startDate);
      const timeA = isValid(dateA) ? dateA.getTime() : 0;
      const timeB = isValid(dateB) ? dateB.getTime() : 0;
      return timeA - timeB;
    });
  }, [jobs, externalEvents, clients]);

  const getStatusColor = (status?: JobStatus, type?: string, color?: string) => {
    if (type === 'external') return color || '#6366f1';
    switch(status) {
      case JobStatus.CONFIRMED: return '#10b981';
      case JobStatus.PENCILLED: return '#f59e0b';
      case JobStatus.POTENTIAL: return '#fbbf24';
      case JobStatus.COMPLETED: return '#0ea5e9';
      default: return '#94a3b8';
    }
  };

  return (
    <div className="bg-white rounded-[32px] border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full max-h-[800px]">
      <div className="px-6 py-4 flex items-center justify-between bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">
               {format(currentDate, 'MMMM yyyy')}
             </h3>
             <div className="relative overflow-hidden w-8 h-8 flex items-center justify-center bg-slate-50 rounded-lg border border-slate-200 group cursor-pointer">
                <i className="fa-solid fa-calendar-days text-[10px] text-slate-400 group-hover:text-indigo-600"></i>
                <input type="month" onChange={e => e.target.value && setCurrentDate(parse(`${e.target.value}-01`, 'yyyy-MM-dd', new Date()))} className="absolute inset-0 opacity-0 cursor-pointer" />
             </div>
          </div>
          <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-xl text-slate-400"><i className="fa-solid fa-chevron-left text-xs"></i></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest mx-2">Today</button>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-xl text-slate-400"><i className="fa-solid fa-chevron-right text-xs"></i></button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 bg-slate-50/50 border-b border-slate-100 shrink-0">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">{day}</div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
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
            <div key={wIdx} className="relative min-h-[140px] border-b border-slate-50">
              <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                {week.map((day, dIdx) => (
                  <div key={dIdx} className={`border-r border-slate-50 flex flex-col p-2 ${!isSameMonth(day, currentDate) ? 'bg-slate-50/20' : ''}`}>
                    <span className={`text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-lg ${isSameDay(day, new Date()) ? 'bg-indigo-600 text-white shadow-md' : isSameMonth(day, currentDate) ? 'text-slate-900' : 'text-slate-200'}`}>
                      {format(day, 'd')}
                    </span>
                  </div>
                ))}
              </div>

              <div className="relative pt-10 pb-2 px-1 space-y-1">
                {lanes.map((lane, lIdx) => (
                  <div key={lIdx} className="grid grid-cols-7 gap-1 h-7 relative">
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
                          onClick={() => entry.jobId && navigate(`/jobs/${entry.jobId}`)}
                          style={{ gridColumn: `${offset + 1} / span ${duration}`, backgroundColor: bgColor }}
                          className={`h-6 rounded-lg shadow-sm flex items-center px-3 z-10 transition-all hover:brightness-105 hover:scale-[1.02] cursor-pointer ${textColor}`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden w-full">
                            {entry.type === 'external' && <i className="fa-brands fa-google text-[8px] opacity-70"></i>}
                            <span className="text-[9px] font-black uppercase tracking-tight whitespace-nowrap overflow-hidden">
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
