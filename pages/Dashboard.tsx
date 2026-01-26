
import React, { useMemo, useState, useEffect } from 'react';
import * as ReactRouterDOM from 'react-router-dom';

const { Link } = ReactRouterDOM;

import { AppState, JobStatus, InvoiceStatus, UserPlan } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { Calendar } from '../components/Calendar';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { parseISO, isAfter, startOfDay, differenceInDays, isSameDay, isValid } from 'date-fns';
import { getBusinessInsights } from '../services/gemini';
import { GoogleGenAI } from "@google/genai";

interface DashboardProps {
  state: AppState;
  onNewJobClick: () => void;
  onSyncCalendar: () => void;
  isSyncing: boolean;
}

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', 
  '#ec4899', '#f97316', '#14b8a6', '#06b6d4', '#84cc16', 
  '#a855f7', '#f43f5e', '#475569'
];

export const Dashboard: React.FC<DashboardProps> = ({ state, onNewJobClick, onSyncCalendar, isSyncing }) => {
  const [dailyBrief, setDailyBrief] = useState<string | null>(null);
  const [growthInsight, setGrowthInsight] = useState<string>("Analyzing your pipeline...");
  const [isBriefLoading, setIsBriefLoading] = useState(false);
  const [isAssignmentsOpen, setIsAssignmentsOpen] = useState(false);
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(false);

  const isPro = state.user?.plan && state.user.plan !== UserPlan.FREE;

  useEffect(() => {
    const fetchBrief = async () => {
      if (!isPro || state.jobs.length === 0) return;
      setIsBriefLoading(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const overdue = state.invoices.filter(i => i.status === InvoiceStatus.OVERDUE || (i.status === InvoiceStatus.SENT && isAfter(new Date(), parseISO(i.dueDate)))).length;
        const upcoming = state.jobs.filter(j => j.status === JobStatus.CONFIRMED).length;
        
        const prompt = `Analyze this freelance business state: ${upcoming} upcoming jobs, ${overdue} overdue invoices. Provide a one-sentence "Executive Briefing" for the user today. Action-oriented, professional. No markdown.`;
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        setDailyBrief(response.text);

        // Fetch growth insight separately to avoid JSX promise issues
        const insight = await getBusinessInsights(state);
        setGrowthInsight(insight);
      } catch (err) {
        setDailyBrief("Review your pipeline and settlement status today.");
        setGrowthInsight("Maintain strong client momentum.");
      } finally {
        setIsBriefLoading(false);
      }
    };
    fetchBrief();
  }, [state.jobs.length, isPro]);

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const confirmedFutureTotal = (state.jobs || [])
      .filter(j => {
        if (!j.startDate) return false;
        const startDate = parseISO(j.startDate);
        if (!isValid(startDate)) return false;
        return j.status === JobStatus.CONFIRMED && (isAfter(startDate, today) || isSameDay(startDate, today));
      })
      .reduce((sum, j) => sum + (j.totalRecharge || 0), 0);
    
    const potentialTotal = (state.jobs || [])
      .filter(j => j.status === JobStatus.POTENTIAL || j.status === JobStatus.PENCILLED)
      .reduce((sum, j) => sum + (j.totalRecharge || 0), 0);

    return { confirmedFutureTotal, potentialTotal };
  }, [state.jobs]);

  const upcomingAssignments = useMemo(() => {
    const today = startOfDay(new Date());
    return (state.jobs || [])
      .filter(job => {
        if (!job.startDate) return false;
        const startDate = parseISO(job.startDate);
        if (!isValid(startDate)) return false;
        return (isAfter(startDate, today) || isSameDay(startDate, today)) && job.status !== JobStatus.CANCELLED;
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [state.jobs]);

  const nextJob = upcomingAssignments[0];

  const unpaidInvoices = useMemo(() => {
    return (state.invoices || [])
      .filter(inv => inv.status !== InvoiceStatus.PAID)
      .sort((a, b) => {
        if (!a.dueDate || !b.dueDate) return 0;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [state.invoices]);

  const nextPayment = unpaidInvoices[0];
  const nextPaymentJob = nextPayment ? state.jobs.find(j => j.id === nextPayment.jobId) : null;

  const daysUntilPayment = useMemo(() => {
    if (!nextPayment || !nextPayment.dueDate) return null;
    const today = startOfDay(new Date());
    const due = startOfDay(parseISO(nextPayment.dueDate));
    if (!isValid(due)) return null;
    return differenceInDays(due, today);
  }, [nextPayment]);

  const jobsPerClientData = useMemo(() => {
    const map = new Map();
    (state.jobs || []).forEach(job => {
      const client = state.clients.find(c => c.id === job.clientId);
      const name = client?.name || 'Unknown';
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [state.jobs, state.clients]);

  const revenuePerClientData = useMemo(() => {
    const map = new Map();
    (state.jobs || []).forEach(job => {
      const client = state.clients.find(c => c.id === job.clientId);
      const name = client?.name || 'Unknown';
      map.set(name, (map.get(name) || 0) + (job.totalRecharge || 0));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [state.jobs, state.clients]);

  const renderLegendText = (value: string) => {
    return <span className="text-slate-900 font-black uppercase text-[10px] ml-2">{value}</span>;
  };

  return (
    <div className="flex flex-col gap-6 h-full max-w-screen-2xl mx-auto overflow-y-auto custom-scrollbar pb-10">
      <header className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
             <i className="fa-solid fa-bolt text-xs"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">Command Center</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Live Intelligence Hub</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSyncCalendar} disabled={isSyncing} className="bg-white text-slate-600 border border-slate-200 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center shadow-sm disabled:opacity-50">
            {isSyncing ? <i className="fa-solid fa-spinner animate-spin mr-2"></i> : <i className="fa-brands fa-google mr-2 text-indigo-600"></i>}
            Sync Cloud
          </button>
          <button onClick={onNewJobClick} className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center">
            <i className="fa-solid fa-plus mr-2"></i>Add Project
          </button>
        </div>
      </header>

      {isPro && (
        <div className="bg-slate-900 rounded-[32px] p-1 flex items-center shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="w-12 h-12 bg-indigo-600 rounded-[28px] flex items-center justify-center shrink-0 ml-1">
             <i className={`fa-solid ${isBriefLoading ? 'fa-spinner animate-spin' : 'fa-sparkles'} text-white text-xs`}></i>
          </div>
          <div className="px-6 py-3 flex-1">
             <div className="flex items-center gap-2 mb-0.5">
               <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em]">Daily Intelligence Pulse</span>
               <span className="text-[8px] font-black text-slate-600 uppercase">Pro Access</span>
             </div>
             <p className="text-[13px] font-black text-white leading-tight">
               {isBriefLoading ? 'Synthesizing business metrics...' : dailyBrief || 'Awaiting analysis of latest records.'}
             </p>
          </div>
          <Link to="/assistant" className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-colors">Chat Details <i className="fa-solid fa-arrow-right ml-1"></i></Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          className="bg-indigo-600 p-5 rounded-[32px] text-white shadow-xl h-24 flex flex-col justify-between relative cursor-pointer hover:bg-indigo-700 transition-colors"
          onClick={() => { setIsAssignmentsOpen(!isAssignmentsOpen); setIsPaymentsOpen(false); }}
        >
           <p className="text-indigo-200 text-[9px] font-black uppercase tracking-widest leading-none flex items-center gap-2">Assignments <i className={`fa-solid fa-chevron-${isAssignmentsOpen ? 'up' : 'down'} text-[7px]`}></i></p>
           {nextJob ? (
             <div className="flex items-end justify-between mt-1">
               <p className="text-lg font-black truncate leading-none max-w-[180px]">{nextJob.description}</p>
               <p className="text-[10px] font-bold text-indigo-100">{formatDate(nextJob.startDate)}</p>
             </div>
           ) : <p className="text-sm font-black text-indigo-200 mt-1">Ready for work</p>}
           {isAssignmentsOpen && (
             <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-slate-200 rounded-[24px] shadow-2xl z-[100] max-h-60 overflow-y-auto custom-scrollbar p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {upcomingAssignments.slice(0, 10).map(job => (
                  <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 rounded-xl text-slate-900 border-b border-slate-50 last:border-0">
                    <div className="truncate pr-4">
                      <p className="text-xs font-black truncate">{job.description}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{state.clients.find(c => c.id === job.clientId)?.name}</p>
                    </div>
                    <p className="text-[10px] font-black text-indigo-600 shrink-0">{formatDate(job.startDate)}</p>
                  </Link>
                ))}
                {upcomingAssignments.length === 0 && <p className="text-[10px] text-slate-400 p-4 text-center font-bold">No upcoming entries</p>}
             </div>
           )}
        </div>

        <div 
          className="bg-emerald-600 p-5 rounded-[32px] text-white shadow-xl h-24 flex flex-col justify-between relative cursor-pointer hover:bg-emerald-700 transition-colors"
          onClick={() => { setIsPaymentsOpen(!isPaymentsOpen); setIsAssignmentsOpen(false); }}
        >
           <p className="text-emerald-100 text-[9px] font-black uppercase tracking-widest leading-none flex items-center gap-2">Accounts Receivable <i className={`fa-solid fa-chevron-${isPaymentsOpen ? 'up' : 'down'} text-[7px]`}></i></p>
           {nextPayment ? (
             <div className="flex items-end justify-between mt-1">
               <div>
                 <p className="text-2xl font-black leading-none">{formatCurrency(nextPaymentJob?.totalRecharge || 0)}</p>
                 <p className="text-[10px] font-bold text-emerald-100 mt-1 uppercase tracking-tighter">Due {formatDate(nextPayment.dueDate)}</p>
               </div>
               <div className="text-right">
                 {daysUntilPayment !== null && (
                   <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${daysUntilPayment < 0 ? 'bg-rose-500' : 'bg-white/20'}`}>
                     {daysUntilPayment < 0 ? `Overdue` : `${daysUntilPayment}d left`}
                   </span>
                 )}
               </div>
             </div>
           ) : <p className="text-sm font-black text-emerald-100 mt-1">All Clear</p>}
           {isPaymentsOpen && (
             <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-slate-200 rounded-[24px] shadow-2xl z-[100] max-h-60 overflow-y-auto custom-scrollbar p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {unpaidInvoices.map(inv => {
                  const job = state.jobs.find(j => j.id === inv.jobId);
                  return (
                    <Link key={inv.id} to="/invoices" className="block px-4 py-3 hover:bg-slate-50 rounded-xl text-slate-900 border-b border-slate-50 last:border-0">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-xs font-black truncate max-w-[160px]">{job?.description || 'Invoice'}</p>
                        <p className="text-xs font-black text-emerald-600">{formatCurrency(job?.totalRecharge || 0)}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">REF: {inv.id}</p>
                        <p className={`text-[9px] font-black uppercase ${isAfter(new Date(), parseISO(inv.dueDate)) ? 'text-rose-500' : 'text-slate-500'}`}>Due {formatDate(inv.dueDate)}</p>
                      </div>
                    </Link>
                  );
                })}
                {unpaidInvoices.length === 0 && <p className="text-[10px] text-slate-400 p-4 text-center font-bold">No pending settlements</p>}
             </div>
           )}
        </div>

        <div className="bg-slate-900 p-5 rounded-[32px] text-white shadow-xl h-24 flex flex-col justify-between">
           <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest leading-none">Confirmed Pipeline</p>
           <p className="text-2xl font-black leading-none mt-1">{formatCurrency(stats.confirmedFutureTotal)}</p>
        </div>

        <div className="bg-slate-900 p-5 rounded-[32px] text-white shadow-xl h-24 flex flex-col justify-between">
           <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest leading-none">Potential Value</p>
           <p className="text-2xl font-black leading-none mt-1">{formatCurrency(stats.potentialTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 h-[600px]">
           <Calendar jobs={state.jobs} externalEvents={state.externalEvents} clients={state.clients} />
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
           {isPro && (
            <div className="bg-indigo-600 rounded-[40px] p-8 shadow-xl text-white relative overflow-hidden flex-1">
               <div className="absolute top-0 right-0 p-8 opacity-10">
                 <i className="fa-solid fa-wand-magic-sparkles text-7xl"></i>
               </div>
               <div className="relative z-10 flex flex-col h-full">
                 <div className="flex items-center gap-3 mb-6">
                   <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20">
                     <i className="fa-solid fa-sparkles text-[12px]"></i>
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-[0.2em]">Growth Strategy</span>
                 </div>
                 <p className="text-xl font-black leading-relaxed italic flex-1">
                   {growthInsight}
                 </p>
                 <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">AI Engine Active</span>
                    <Link to="/assistant" className="text-[9px] font-black text-white uppercase tracking-widest bg-white/10 px-4 py-2 rounded-xl hover:bg-white/20 transition-all">Deep Analysis</Link>
                 </div>
               </div>
            </div>
           )}
           <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm flex flex-col flex-1">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Cloud Infrastructure</h4>
              <div className="space-y-6 flex-1">
                 <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Sync Status</span>
                    <span className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Synchronized
                    </span>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Google Calendar</span>
                    <span className="text-[10px] font-black text-indigo-500 uppercase">Authorization Active</span>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Data Model</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Multi-User v3.0</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
