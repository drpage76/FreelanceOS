
import React, { useMemo, useState } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import { parseISO, isAfter, startOfDay, addDays, isBefore, isValid, format, differenceInDays } from 'date-fns';

const { Link } = ReactRouterDOM;

import { AppState, JobStatus, InvoiceStatus, UserPlan } from '../types';
import { formatCurrency, calculateRevenueStats } from '../utils';
import { Calendar } from '../components/Calendar';

interface DashboardProps {
  state: AppState;
  onNewJobClick: () => void;
  onSyncCalendar: () => void;
  isSyncing: boolean;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export const Dashboard: React.FC<DashboardProps> = ({ state, onNewJobClick, onSyncCalendar, isSyncing }) => {
  const [dueFilterDays, setDueFilterDays] = useState<number>(30);
  const [jobFilterDays, setJobFilterDays] = useState<number>(30);
  const isPro = state.user?.plan === UserPlan.PRO || state.user?.plan === UserPlan.BETA;

  const revStats = useMemo(() => calculateRevenueStats(state.jobs, 60000), [state.jobs]);

  const upcomingPayments = useMemo(() => {
    const today = startOfDay(new Date());
    const limitDate = addDays(today, dueFilterDays);
    
    return state.invoices
      .filter(inv => {
        if (inv.status === InvoiceStatus.PAID) return false;
        const dueDate = parseISO(inv.dueDate);
        return isValid(dueDate) && (isAfter(dueDate, today) || isSameDay(dueDate, today)) && isBefore(dueDate, limitDate);
      })
      .map(inv => {
        const job = state.jobs.find(j => j.id === inv.jobId);
        const client = state.clients.find(c => c.id === job?.clientId);
        const daysRemaining = differenceInDays(parseISO(inv.dueDate), today);
        return { ...inv, job, client, daysRemaining };
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [state.invoices, state.jobs, state.clients, dueFilterDays]);

  const upcomingJobs = useMemo(() => {
    const today = startOfDay(new Date());
    const limitDate = addDays(today, jobFilterDays);
    
    return state.jobs
      .filter(job => {
        if (job.status === JobStatus.CANCELLED || job.status === JobStatus.COMPLETED) return false;
        const startDate = parseISO(job.startDate);
        return isValid(startDate) && (isAfter(startDate, today) || isSameDay(startDate, today)) && isBefore(startDate, limitDate);
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [state.jobs, jobFilterDays]);

  const revenueByClientData = useMemo(() => {
    const clientRev: Record<string, number> = {};
    state.jobs.forEach(j => {
      if (j.status === JobStatus.CANCELLED) return;
      const client = state.clients.find(c => c.id === j.clientId);
      const name = client?.name || 'Unknown';
      clientRev[name] = (clientRev[name] || 0) + j.totalRecharge;
    });
    return Object.entries(clientRev)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [state.jobs, state.clients]);

  return (
    <div className="flex flex-col gap-4 max-w-screen-2xl mx-auto pb-4 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-1 italic">Command Center</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Business Intelligence</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onSyncCalendar} disabled={isSyncing} className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center shadow-sm disabled:opacity-50">
            {isSyncing ? <i className="fa-solid fa-spinner animate-spin mr-2"></i> : <i className="fa-brands fa-google mr-2 text-indigo-600"></i>}
            Refresh
          </button>
          <button onClick={onNewJobClick} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center">
            <i className="fa-solid fa-plus mr-2"></i>New Project
          </button>
        </div>
      </header>

      {/* Top Row: 3 Control Boxes (Height Reduced to 200px) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-[32px] border border-slate-200 p-5 shadow-sm flex flex-col h-[200px]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Receivable</p>
            <select 
              value={dueFilterDays} 
              onChange={(e) => setDueFilterDays(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[8px] font-black uppercase outline-none"
            >
              <option value={7}>7D</option>
              <option value={30}>30D</option>
            </select>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
            {upcomingPayments.slice(0, 5).map(inv => (
              <div key={inv.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-white transition-all">
                <div className="min-w-0">
                  <p className="text-[8px] font-black text-indigo-500 uppercase truncate">{inv.client?.name}</p>
                  <p className="text-[10px] font-black text-slate-900 truncate">{inv.job?.description}</p>
                </div>
                <p className="text-xs font-black text-slate-900 ml-2">{formatCurrency(inv.job?.totalRecharge || 0)}</p>
              </div>
            ))}
            {upcomingPayments.length === 0 && <p className="text-[10px] text-slate-300 uppercase text-center py-4">No due payments</p>}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-200 p-5 shadow-sm flex flex-col h-[200px]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Pipeline</p>
            <select 
              value={jobFilterDays} 
              onChange={(e) => setJobFilterDays(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[8px] font-black uppercase outline-none"
            >
              <option value={7}>7D</option>
              <option value={30}>30D</option>
            </select>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
            {upcomingJobs.slice(0, 5).map(job => (
              <div key={job.id} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-white transition-all">
                <div className="min-w-0">
                  <p className="text-[8px] font-black text-emerald-500 uppercase">{format(parseISO(job.startDate), 'dd MMM')}</p>
                  <p className="text-[10px] font-black text-slate-900 truncate">{job.description}</p>
                </div>
                <Link to={`/jobs/${job.id}`} className="w-6 h-6 bg-slate-900 text-white rounded-lg flex items-center justify-center"><i className="fa-solid fa-arrow-right text-[8px]"></i></Link>
              </div>
            ))}
            {upcomingJobs.length === 0 && <p className="text-[10px] text-slate-300 uppercase text-center py-4">No upcoming jobs</p>}
          </div>
        </div>

        <div className="bg-slate-900 rounded-[32px] p-5 shadow-xl text-white flex flex-col justify-between h-[200px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10"><i className="fa-solid fa-chart-line text-6xl"></i></div>
          <div className="relative z-10">
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Fiscal Performance (Apr 6 Start)</p>
            <p className="text-3xl font-black tracking-tighter mt-1">{formatCurrency(revStats.ytdRevenue)}</p>
          </div>
          <div className="relative z-10 space-y-2">
            <div className="flex justify-between items-center text-[8px] font-black uppercase">
              <span className="text-indigo-400">Target Benchmark</span>
              <span>{Math.round(revStats.percentOfGoal)}%</span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden p-0.5">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${revStats.percentOfGoal}%` }}></div>
            </div>
            <div className="flex justify-between items-center">
               <p className="text-[8px] text-slate-500 font-black uppercase">Run-rate: {formatCurrency(revStats.dailyRunRate)}/d</p>
               {!isPro && <Link to="/settings" className="text-[8px] text-amber-400 font-black uppercase flex items-center gap-1"><i className="fa-solid fa-lock"></i> Forecast</Link>}
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Calendar (Reduced Height) */}
      <div className="h-[500px]">
        <Calendar jobs={state.jobs} externalEvents={state.externalEvents} clients={state.clients} />
      </div>

      {/* Bottom Row: Analytics (Compacted to fit without scroll) */}
      <div className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm h-[320px] overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-8 items-center h-full">
          <div className="w-full lg:w-4/12 h-full flex flex-col items-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 w-full">Revenue Distribution</p>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueByClientData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    animationDuration={1000}
                    stroke="none"
                  >
                    {revenueByClientData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="w-full lg:w-8/12 flex flex-col h-full border-l border-slate-100 lg:pl-8">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Top Revenue Accounts</p>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
              {revenueByClientData.map((client, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-[10px]" style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">{client.name}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">Ranking #{idx + 1}</p>
                    </div>
                  </div>
                  <p className="text-sm font-black text-slate-900">{formatCurrency(client.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const isSameDay = (d1: Date, d2: Date) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};
