import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
  differenceInDays,
  startOfDay,
  endOfDay,
  parse,
  isValid,
  subDays,
} from "date-fns";
import { Job, JobStatus, ExternalEvent, Client, SchedulingType } from "../types";
import { getCalendarDays } from "../utils";

interface CalendarProps {
  jobs: Job[];
  externalEvents: ExternalEvent[];
  clients: Client[];
  googleAccessToken?: string; // ✅ NEW: pass token to show personal google events
}

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";
const CALENDAR_ID = "primary";

// Map Google `event.colorId` to something usable in UI (simple + reliable).
// (Google has 1..11; exact hex varies by user theme, so we keep a consistent palette.)
const GOOGLE_COLOR_ID_MAP: Record<string, string> = {
  "1": "#a4bdfc",
  "2": "#7ae7bf",
  "3": "#dbadff",
  "4": "#ff887c",
  "5": "#fbd75b",
  "6": "#ffb878",
  "7": "#46d6db",
  "8": "#e1e1e1",
  "9": "#5484ed",
  "10": "#51b749",
  "11": "#dc2127",
};

function safeISODateFromGoogleEvent(ev: any, which: "start" | "end"): string | null {
  const obj = ev?.[which];
  if (!obj) return null;

  // All-day events: { date: "YYYY-MM-DD" }
  if (obj.date && typeof obj.date === "string") return obj.date;

  // Timed events: { dateTime: "...", timeZone: "..." }
  if (obj.dateTime && typeof obj.dateTime === "string") {
    // We store only date in ExternalEvent, Calendar UI uses date-only.
    return obj.dateTime.slice(0, 10);
  }

  return null;
}

function safeTimeLabelFromGoogleEvent(ev: any): string | undefined {
  const s = ev?.start?.dateTime;
  const e = ev?.end?.dateTime;
  if (!s || !e) return "Full Day";

  try {
    const sd = parseISO(s);
    const ed = parseISO(e);
    if (!isValid(sd) || !isValid(ed)) return undefined;
    return `${format(sd, "HH:mm")} - ${format(ed, "HH:mm")}`;
  } catch {
    return undefined;
  }
}

export const Calendar: React.FC<CalendarProps> = ({ jobs, externalEvents, clients, googleAccessToken }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [googlePersonalEvents, setGooglePersonalEvents] = useState<ExternalEvent[]>([]);
  const navigate = useNavigate();

  const days = getCalendarDays(currentDate);

  // Fetch personal Google events for the visible grid range (first day -> last day)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!googleAccessToken) {
        setGooglePersonalEvents([]);
        return;
      }

      try {
        const gridStart = days?.[0];
        const gridEnd = days?.[days.length - 1];
        if (!gridStart || !gridEnd) return;

        // Use UTC ISO strings for Google API parameters
        const timeMin = new Date(Date.UTC(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate(), 0, 0, 0)).toISOString();
        const timeMax = new Date(Date.UTC(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate(), 23, 59, 59)).toISOString();

        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "2500",
          showDeleted: "false",
        });

        const url = `${GCAL_BASE}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params.toString()}`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          // If token expires etc, don’t break calendar UI.
          // Just stop showing personal events.
          setGooglePersonalEvents([]);
          return;
        }

        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];

        const mapped: ExternalEvent[] = items
          .filter((ev: any) => {
            // ✅ Skip FreelanceOS job events that you created in Google (avoid duplicates)
            const priv = ev?.extendedProperties?.private;
            if (priv?.freelanceosJobId) return false;

            // Skip cancelled events (Google sometimes returns status: "cancelled")
            if ((ev?.status || "").toLowerCase() === "cancelled") return false;

            return true;
          })
          .map((ev: any) => {
            const startDate = safeISODateFromGoogleEvent(ev, "start");
            const endDate = safeISODateFromGoogleEvent(ev, "end") || startDate;

            // If missing start, ignore
            if (!startDate) return null;

            const color =
              (ev?.colorId && GOOGLE_COLOR_ID_MAP[String(ev.colorId)]) ||
              "#6366f1"; // fallback indigo

            return {
              id: String(ev.id || `${startDate}-${Math.random()}`),
              title: String(ev.summary || "Personal Event"),
              startDate,
              endDate: String(endDate || startDate),
              source: "google",
              link: ev?.htmlLink ? String(ev.htmlLink) : undefined,
              color,
              // Optional fields used by your UI tooltips:
              timeLabel: safeTimeLabelFromGoogleEvent(ev),
            } as any;
          })
          .filter(Boolean) as ExternalEvent[];

        if (!cancelled) setGooglePersonalEvents(mapped);
      } catch {
        if (!cancelled) setGooglePersonalEvents([]);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAccessToken, currentDate]); // month changes => refetch

  const weeks = useMemo(() => {
    const weeksList: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) weeksList.push(days.slice(i, i + 7));
    return weeksList;
  }, [days]);

  const allCalendarEntries = useMemo(() => {
    const entries: any[] = [];
    const allInternalJobIds = new Set((jobs || []).map((j) => String(j.id)));

    (jobs || []).forEach((job) => {
      if (job.syncToCalendar === false) return;

      const client = clients.find((c) => c.id === job.clientId);
      const clientName = client?.name || "Unknown";
      const locationLabel = job.location ? ` @ ${job.location}` : "";
      const statusPrefix = `[${job.status.toUpperCase()}] #${job.id}`;

      if (job.schedulingType === SchedulingType.SHIFT_BASED) {
        if (job.shifts && job.shifts.length > 0) {
          job.shifts.forEach((shift) => {
            const sDate = shift.startDate ? parseISO(shift.startDate) : null;
            if (!sDate || !isValid(sDate)) return;

            entries.push({
              id: shift.id,
              jobId: job.id,
              title: `${statusPrefix} | ${clientName}: ${shift.title || "Shift"}${locationLabel}`,
              startDate: shift.startDate,
              endDate: shift.endDate || shift.startDate,
              type: "shift",
              status: job.status,
              timeLabel: shift.isFullDay ? "Full Day" : `${shift.startTime || "09:00"} - ${shift.endTime || "17:30"}`,
              clientName,
              fullDescription: job.description,
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
          type: "job",
          status: job.status,
          clientName,
          fullDescription: job.description,
        });
      }
    });

    // Combine: externalEvents prop + personal google events fetched here
    const combinedExternal = [...(externalEvents || []), ...(googlePersonalEvents || [])];

    (combinedExternal || []).forEach((e) => {
      const title = e.title || "";

      // existing de-dupe logic: if external title contains our protocol ref, skip it
      const refMatch = title.match(/\(Ref:\s*([a-zA-Z0-9-]+)\)/i) || title.match(/#([a-zA-Z0-9-]+)/);
      if (refMatch) {
        const matchedId = refMatch[1];
        if (allInternalJobIds.has(matchedId)) return;
      }

      const sDate = e.startDate ? parseISO(e.startDate) : null;
      if (sDate && isValid(sDate)) {
        let endDate = e.endDate;

        // Your existing Google all-day fix: Google end.date is exclusive
        if (e.source === "google" && e.startDate !== e.endDate) {
          const endISO = parseISO(e.endDate);
          if (isValid(endISO)) {
            endDate = format(subDays(endISO, 1), "yyyy-MM-dd");
          }
        }

        entries.push({ ...e, endDate, type: "external" });
      }
    });

    return entries.sort((a, b) => {
      const dateA = parseISO(a.startDate);
      const dateB = parseISO(b.startDate);
      return (isValid(dateA) ? dateA.getTime() : 0) - (isValid(dateB) ? dateB.getTime() : 0);
    });
  }, [jobs, externalEvents, googlePersonalEvents, clients]);

  const getStatusColor = (status?: JobStatus, type?: string, color?: string) => {
    if (type === "external") return color || "#6366f1";
    switch (status) {
      case JobStatus.CONFIRMED:
        return "#10b981";
      case JobStatus.AWAITING_PAYMENT:
        return "#06b6d4";
      case JobStatus.COMPLETED:
        return "#10b981";
      case JobStatus.PENCILLED:
        return "#f59e0b";
      case JobStatus.POTENTIAL:
        return "#fbbf24";
      default:
        return "#94a3b8";
    }
  };

  const handleEntryClick = (entry: any) => {
    if (entry.link) {
      window.open(entry.link, "_blank");
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
              {format(currentDate, "MMMM yyyy")}
            </h3>
            <div className="relative overflow-hidden w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-200 group cursor-pointer transition-all hover:border-indigo-400">
              <i className="fa-solid fa-calendar-day text-[14px] text-slate-400 group-hover:text-indigo-600"></i>
              <input
                type="month"
                onChange={(e) => e.target.value && setCurrentDate(parse(`${e.target.value}-01`, "yyyy-MM-dd", new Date()))}
                className="absolute inset-0 opacity-0 cursor-pointer"
                title="Jump to date"
              />
            </div>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-[16px] border border-slate-200 shadow-inner">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-white rounded-lg text-slate-400 transition-all"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 sm:px-6 py-1 bg-indigo-600 text-white rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest mx-1 sm:mx-2 shadow-sm"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-white rounded-lg text-slate-400 transition-all"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 bg-slate-50/30 border-b border-slate-100">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>

      <div className="flex-1">
        {weeks.map((week, wIdx) => {
          const weekStart = startOfDay(week[0]),
            weekEnd = endOfDay(week[6]);
          const weekEntries = allCalendarEntries.filter((e) => {
            const s = parseISO(e.startDate);
            const end = parseISO(e.endDate);
            if (!isValid(s) || !isValid(end)) return false;
            return startOfDay(s) <= weekEnd && endOfDay(end) >= weekStart;
          });

          const lanes: any[][] = [];
          weekEntries.forEach((entry) => {
            const sISO = parseISO(entry.startDate);
            const eISO = parseISO(entry.endDate);
            const s = startOfDay(isValid(sISO) ? sISO : weekStart);
            const e = endOfDay(isValid(eISO) ? eISO : weekEnd);
            const viewStart = Math.max(s.getTime(), weekStart.getTime());
            const viewEnd = Math.min(e.getTime(), weekEnd.getTime());

            let l = 0;
            while (lanes[l]) {
              const hasCollision = lanes[l].some((le) => {
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
                  <div
                    key={dIdx}
                    className={`border-r border-slate-50 flex flex-col p-2 ${!isSameMonth(day, currentDate) ? "bg-slate-50/10" : ""}`}
                  >
                    <span
                      className={`text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-lg ${
                        isSameDay(day, new Date())
                          ? "bg-indigo-600 text-white shadow-md"
                          : isSameMonth(day, currentDate)
                          ? "text-slate-900"
                          : "text-slate-200"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                ))}
              </div>

              <div className="relative pt-10 pb-2 px-1 space-y-1">
                {lanes.map((lane, lIdx) => (
                  <div key={lIdx} className="grid grid-cols-7 gap-1 h-6 relative">
                    {week.map((day, dIdx) => {
                      const entry = lane.find((e) => {
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
                      const textColor = bgColor === "#fbbf24" || bgColor === "#f59e0b" ? "text-slate-900" : "text-white";

                      const tooltipText =
                        entry.type === "external"
                          ? `Google Event: ${entry.title}\nPeriod: ${formatDate(entry.startDate)} - ${formatDate(entry.endDate)}`
                          : `Project: ${entry.fullDescription || entry.title}\nClient: ${entry.clientName}\nStatus: ${entry.status}\nTime: ${
                              entry.timeLabel || "Continuous"
                            }`;

                      return (
                        <div
                          key={`${entry.id}-${wIdx}`}
                          onClick={() => handleEntryClick(entry)}
                          style={{ gridColumn: `${offset + 1} / span ${duration}`, backgroundColor: bgColor }}
                          title={tooltipText}
                          className={`h-5 rounded-lg shadow-sm flex items-center px-3 z-10 transition-all hover:brightness-105 hover:scale-[1.01] cursor-pointer ${textColor}`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden w-full">
                            {entry.type === "external" && <i className="fa-brands fa-google text-[7px] opacity-70"></i>}
                            <span className="text-[8px] font-black uppercase tracking-tight whitespace-nowrap overflow-hidden">
                              {entry.timeLabel ? `${entry.timeLabel} • ` : ""}
                              {entry.title}
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

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), "dd MMM yy");
  } catch {
    return dateStr;
  }
};