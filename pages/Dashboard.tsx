
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

const { Link } = ReactRouterDOM;

import { AppState, JobStatus, InvoiceStatus, UserPlan } from '../types';
import { formatCurrency, formatDate, calculateRevenueStats } from '../utils';
import { Calendar } from '../components/Calendar';
import { parseISO, isAfter, startOfDay, isSameDay, isValid, format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { getBusinessInsights } from '../services/gemini';
import { GoogleGenAI } from "@google/genai";

interface DashboardProps {
  state: AppState;
  onNewJobClick: () => void;
  onSyncCalendar: () => void;
  isSyncing: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ state, onNewJobClick, onSyncCalendar, isSyncing }) => {
  const [dailyBrief, setDailyBrief] = useState<string | null>(() => sessionStorage.getItem('daily_brief'));
  const [growthInsight, setGrowthInsight] = useState<string>(() => sessionStorage.getItem('growth_insight') || "Analyzing your pipeline...");
  const [isBriefLoading, setIsBriefLoading] = useState(false);
  const [isAssignmentsOpen, setIsAssignmentsOpen] = useState(false);
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(false);
  
  const hasAnalyzed = useRef(false);
  const isPro = state.user?.plan && state.user.plan !== UserPlan.FREE;

  useEffect(() => {
    if (!isPro || state.jobs.length === 0 || hasAnalyzed.current) return;
    
    const fetchBrief = async () => {
      setIsBriefLoading(true);
      hasAnalyzed.current = true;
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const overdue = state.invoices.filter(i => i.status === InvoiceStatus.OVERDUE).length;
        const upcoming = state.jobs.filter(j => j.status === JobStatus.CONFIRMED).length;
        
        const prompt = `Analyze: ${upcoming} upcoming jobs, ${overdue} overdue. One high-impact sentence for a freelancer's morning. No markdown.`;
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        
        const text = response.text || "Focus on pipeline health.";
        setDailyBrief(text);
        sessionStorage.setItem('daily_brief', text);

        const insight = await getBusinessInsights(state);
        setGrowthInsight(insight);
        sessionStorage.setItem('growth_insight', insight);
      } catch (err) {
        console.warn("AI Analysis Blipped:", err);
      } finally {
        setIsBriefLoading(false);
      }
    };
    
    fetchBrief();
  }, [state.jobs.length, isPro]);

  const revStats = useMemo(() => calculateRevenueStats(state.jobs, 60000), [state.jobs]);

  const revenueData = useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => {
      const d = subMonths(new Date(), 5 - i);
      return {
        name: format(d, 'MMM'),
        monthStart: startOfMonth(d),
        monthEnd: endOfMonth(d),
        total: 0
      };
    });

    state.jobs.forEach(job => {
      if (job.status === JobStatus.CANCELLED) return;
      const jobDate = parseISO(job.startDate);
      if (!isValid(jobDate)) return;
      months.forEach(m => {
        if (jobDate >= m.monthStart && jobDate <= m.monthEnd) {
          m.total += job.totalRecharge;
        }
      });
    });

    return months;
  }, [state.jobs]);

  const upcomingAssignments = useMemo(() => {
    const today = startOfDay(new Date());
    return (state.jobs || [])
      .filter(job => {
        if (!job.startDate) return false;
        const startDate = parseISO(job.startDate);
        return isValid(startDate) && (isAfter(startDate, today) || isSameDay(startDate, today)) && job.status !== JobStatus.CANCELLED;
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [state.jobs]);

  const unpaidInvoices = useMemo(() => {
    return (state.invoices || [])
      .filter(inv => inv.status !== InvoiceStatus.PAID)
      .sort((a, b) => {
        if (!a.dueDate || !b.dueDate) return 0;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [state.invoices]);

  return (
    <div className="flex flex-col gap-6 h-full max-w-screen-2xl mx-auto overflow-y-auto custom-scrollbar pb-10 px-2">
      <header className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
             <i className="fa-solid fa-bolt text-sm"></i>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Command Center</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Operational Hub</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSyncCalendar} disabled={isSyncing} className="bg-white text-slate-600 border border-slate-200 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center shadow-sm disabled:opacity-50">
            {isSyncing ? <i className="fa-solid fa-spinner animate-spin mr-2"></i> : <i className="fa-brands fa-google mr-2 text-indigo-600"></i>}
            Refresh Cloud
          </button>
          <button onClick={onNewJobClick} className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center">
            <i className="fa-solid fa-plus mr-2"></i>New Job
          </button>
        </div>
      </header>

      {isPro && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8 bg-slate-900 rounded-[32px] p-1 flex items-center shadow-2xl relative overflow-hidden">
            <div className="w-12 h-12 bg-indigo-600 rounded-[28px] flex items-center justify-center shrink-0 ml-1">
               <i className={`fa-solid ${isBriefLoading ? 'fa-spinner animate-spin' : 'fa-sparkles'} text-white text-xs`}></i>
            </div>
            <div className="px-6 py-3 flex-1">
               <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-0.5 block">Daily Strategy Brief</span>
               <p className="text-[13px] font-black text-white leading-tight">
                 {isBriefLoading ? 'Synthesizing...' : dailyBrief || 'Ready for latest analysis.'}
               </p>
            </div>
            <Link to="/assistant" className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-colors">Coach <i className="fa-solid fa-arrow-right ml-1"></i></Link>
          </div>
          <div className="md:col-span-4 bg-white border border-slate-200 rounded-[32px] p-5 shadow-sm flex flex-col justify-center">
             <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Annual Goal Progress</span>
                <span className="text-[10px] font-black text-indigo-600">{Math.round(revStats.percentOfGoal)}%</span>
             </div>
             <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${revStats.percentOfGoal}%` }}></div>
             </div>
             <p className="text-[9px] font-bold text-slate-400 mt-2">Target: £60,000</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm h-24 flex flex-col justify-between cursor-pointer group hover:border-indigo-200 transition-all" onClick={() => setIsAssignmentsOpen(!isAssignmentsOpen)}>
           <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest leading-none">Upcoming Tasks</p>
           <div className="flex items-end justify-between">
              <p className="text-xl font-black text-slate-900">{upcomingAssignments.length}</p>
              <i className="fa-solid fa-calendar-check text-slate-200 group-hover:text-indigo-600 transition-colors"></i>
           </div>
           {isAssignmentsOpen && (
             <div className="absolute mt-20 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 w-64 p-2 animate-in fade-in slide-in-from-top-2">
                {upcomingAssignments.slice(0, 5).map(j => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="block p-2 hover:bg-slate-50 rounded-lg text-[10px] font-black text-slate-700">{j.description}</Link>
                ))}
             </div>
           )}
        </div>

        <div className="bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm h-24 flex flex-col justify-between cursor-pointer group hover:border-emerald-200 transition-all" onClick={() => setIsPaymentsOpen(!isPaymentsOpen)}>
           <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest leading-none">Unpaid Invoices</p>
           <div className="flex items-end justify-between">
              <p className="text-xl font-black text-slate-900">{unpaidInvoices.length}</p>
              <i className="fa-solid fa-credit-card text-slate-200 group-hover:text-emerald-600 transition-colors"></i>
           </div>
        </div>

        <div className="bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm h-24 flex flex-col justify-between">
           <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest leading-none">YTD Revenue</p>
           <p className="text-xl font-black text-slate-900">{formatCurrency(revStats.ytdRevenue)}</p>
        </div>

        <div className="bg-indigo-600 p-5 rounded-[32px] shadow-xl h-24 flex flex-col justify-between text-white">
           <p className="text-indigo-200 text-[9px] font-black uppercase tracking-widest leading-none">Annual Projection</p>
           <p className="text-xl font-black">{formatCurrency(revStats.projectedAnnual)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col gap-6">
           <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm h-[350px]">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Revenue Velocity</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">Monthly Billing Trend</p>
                 </div>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} dy={10} />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                      formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                    />
                    <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
           </div>
           <div className="h-[600px]">
              <Calendar jobs={state.jobs} externalEvents={state.externalEvents} clients={state.clients} />
           </div>
        </div>
        
        <div className="lg:col-span-4 flex flex-col gap-6">
           <div className="bg-indigo-600 rounded-[40px] p-8 shadow-xl text-white relative overflow-hidden min-h-[400px]">
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20">
                    <i className="fa-solid fa-sparkles text-[12px]"></i>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Coach Insight</span>
                </div>
                <p className="text-lg font-black leading-relaxed italic flex-1">
                  {growthInsight}
                </p>
                <Link to="/assistant" className="mt-8 text-[9px] font-black text-white uppercase tracking-widest bg-white/10 px-4 py-4 rounded-2xl hover:bg-white/20 transition-all text-center">Chat with Business Coach</Link>
              </div>
              <div className="absolute top-[-20%] right-[-20%] w-[150%] h-[150%] bg-indigo-500 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
           </div>

           <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm flex flex-col">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Vital Metrics</h4>
              <div className="space-y-6">
                 <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                    <span className="text-xs font-bold text-slate-600">Daily Run Rate</span>
                    <span className="text-[10px] font-black text-slate-900 uppercase">{formatCurrency(revStats.dailyRunRate)} / day</span>
                 </div>
                 <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                    <span className="text-xs font-bold text-slate-600">Client Distribution</span>
                    <span className="text-[10px] font-black text-emerald-500 uppercase">Healthy</span>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Pipeline Velocity</span>
                    <span className="text-[10px] font-black text-indigo-600 uppercase">Optimized</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
