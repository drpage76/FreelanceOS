import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

const { Link } = ReactRouterDOM;

import { AppState, JobStatus, InvoiceStatus, UserPlan } from '../types';
import { formatCurrency, calculateRevenueStats } from '../utils';
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
    <div className="flex flex-col gap-6 max-w-screen-2xl mx-auto pb-20 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-1 italic">Command Center</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Business Intelligence & Control Hub</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onSyncCalendar} disabled={isSyncing} className="bg-white text-slate-600 border border-slate-200 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center shadow-sm disabled:opacity-50">
            {isSyncing ? <i className="fa-solid fa-spinner animate-spin mr-2"></i> : <i className="fa-brands fa-google mr-2 text-indigo-600"></i>}
            Refresh Cloud
          </button>
          <button onClick={onNewJobClick} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center">
            <i className="fa-solid fa-plus mr-2"></i>New Project
          </button>
        </div>
      </header>

      {isPro && (
        <div className="bg-slate-900 rounded-[40px] p-2 flex items-center shadow-2xl relative overflow-hidden group">
          <div className="w-14 h-14 bg-indigo-600 rounded-[32px] flex items-center justify-center shrink-0 ml-1">
             <i className={`fa-solid ${isBriefLoading ? 'fa-spinner animate-spin' : 'fa-sparkles'} text-white text-lg`}></i>
          </div>
          <div className="px-8 py-4 flex-1">
             <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-1 block">Live Strategy Brief</span>
             <p className="text-lg font-bold text-white leading-tight">
               {isBriefLoading ? 'Synthesizing...' : dailyBrief || 'Awaiting synchronization...'}
             </p>
          </div>
          <Link to="/assistant" className="hidden md:flex px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors items-center gap-2">
            Ask Coach <i className="fa-solid fa-arrow-right text-[8px]"></i>
          </Link>
          <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-md transition-all group">
           <div className="flex items-center justify-between mb-4">
             <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Upcoming Tasks</p>
             <i className="fa-solid fa-calendar-check text-slate-300 group-hover:text-indigo-600 transition-colors"></i>
           </div>
           <p className="text-4xl font-black text-slate-900">{upcomingAssignments.length}</p>
           <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Scheduled Projects</p>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-md transition-all group">
           <div className="flex items-center justify-between mb-4">
             <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Unpaid Ledger</p>
             <i className="fa-solid fa-credit-card text-slate-300 group-hover:text-rose-500 transition-colors"></i>
           </div>
           <p className="text-4xl font-black text-slate-900">{unpaidInvoices.length}</p>
           <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Awaiting Settlement</p>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
           <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">Year-to-Date Revenue</p>
           <p className="text-4xl font-black text-slate-900">{formatCurrency(revStats.ytdRevenue)}</p>
           <div className="w-full h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
             <div className="h-full bg-indigo-600" style={{ width: `${revStats.percentOfGoal}%` }}></div>
           </div>
        </div>

        <div className="bg-indigo-600 p-6 rounded-[32px] shadow-xl text-white group hover:scale-[1.02] transition-transform">
           <p className="text-indigo-200 text-[10px] font-black uppercase tracking-widest mb-4">Projected Annual</p>
           <p className="text-4xl font-black">{formatCurrency(revStats.projectedAnnual)}</p>
           <p className="text-[9px] font-bold text-indigo-300 mt-4 uppercase">Based on current run-rate</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col gap-6">
           <div className="bg-white rounded-[40px] border border-slate-200 p-10 shadow-sm">
              <div className="flex items-center justify-between mb-10">
                 <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Revenue Velocity</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">Rolling 6-Month Gross Billing</p>
                 </div>
                 <div className="flex gap-4 text-slate-400">
                   <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                     <span className="text-[9px] font-black uppercase">Gross Profit</span>
                   </div>
                 </div>
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    {/* Fixed: Changed fontBold to fontWeight to satisfy SVGProps type requirements */}
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
           <div className="bg-indigo-600 rounded-[40px] p-10 shadow-2xl text-white relative overflow-hidden min-h-[450px] flex flex-col">
              <div className="relative z-10 flex flex-col h-full flex-1">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20">
                    <i className="fa-solid fa-wand-magic-sparkles text-sm"></i>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em]">Business Advisor</span>
                </div>
                <p className="text-2xl font-black leading-tight flex-1 italic">
                  "{growthInsight}"
                </p>
                <Link to="/assistant" className="mt-12 text-[10px] font-black text-white uppercase tracking-widest bg-white/10 px-6 py-5 rounded-2xl hover:bg-white/20 transition-all text-center border border-white/10">
                  Open AI Workspace
                </Link>
              </div>
              <div className="absolute top-[-10%] right-[-10%] w-full h-full bg-indigo-500 rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
           </div>

           <div className="bg-white rounded-[40px] border border-slate-200 p-10 shadow-sm flex flex-col">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Operational Vitals</h4>
              <div className="space-y-8">
                 <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                    <div>
                      <p className="text-xs font-black text-slate-900">Daily Run Rate</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Rolling average</p>
                    </div>
                    <span className="text-sm font-black text-slate-900">{formatCurrency(revStats.dailyRunRate)}</span>
                 </div>
                 <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                    <div>
                      <p className="text-xs font-black text-slate-900">Client Distribution</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Portfolio health</p>
                    </div>
                    <span className="text-[10px] font-black text-emerald-500 uppercase bg-emerald-50 px-3 py-1 rounded-lg">Healthy</span>
                 </div>
                 <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-900">Pipeline Velocity</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Lead processing</p>
                    </div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-3 py-1 rounded-lg">Optimized</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};