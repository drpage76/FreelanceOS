import React, { useMemo, useState } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import { parseISO, isAfter, startOfDay, addDays, isBefore, isValid, format, differenceInDays } from 'date-fns';

const { Link } = ReactRouterDOM;

import { AppState, JobStatus, InvoiceStatus } from '../types';
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

  const revStats = useMemo(() => calculateRevenueStats(state.jobs, 60000), [state.jobs]);

  const upcomingPayments = useMemo(() => {
    const today = startOfDay(new Date());
    const limitDate = addDays(today, dueFilterDays);
    
    return state.invoices
      .filter(inv => {
        if (inv.status === InvoiceStatus.PAID) return false;
        const dueDate = parseISO(inv.dueDate);
        return isValid(dueDate) && isAfter(dueDate, today) && isBefore(dueDate, limitDate);
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
        return isValid(startDate) && isAfter(startDate, today) && isBefore(startDate, limitDate);
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

      {/* Top Row: 3 Boxes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Box 1: Next Payment Due */}
        <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm flex flex-col h-[380px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Next Payments Due</p>
              <h3 className="text-xl font-black text-slate-900 mt-1">Cashflow</h3>
            </div>
            <select 
              value={dueFilterDays} 
              onChange={(e) => setDueFilterDays(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[9px] font-black uppercase outline-none"
            >
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
            </select>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
            {upcomingPayments.length === 0 ? (
              <div className="h-full flex items-center justify-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center">No settlements in window</p>
              </div>
            ) : (
              upcomingPayments.map(inv => (
                <div key={inv.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest truncate">{inv.client?.name}</p>
                    <p className="text-xs font-black text-slate-900 truncate">{inv.job?.description}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Due in {inv.daysRemaining} days</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-sm font-black text-slate-900">{formatCurrency(inv.job?.totalRecharge || 0)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Box 2: Next Job */}
        <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm flex flex-col h-[380px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Next Production</p>
              <h3 className="text-xl font-black text-slate-900 mt-1">Pipeline</h3>
            </div>
            <select 
              value={jobFilterDays} 
              onChange={(e) => setJobFilterDays(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[9px] font-black uppercase outline-none"
            >
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
            </select>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
            {upcomingJobs.length === 0 ? (
              <div className="h-full flex items-center justify-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center">No upcoming projects</p>
              </div>
            ) : (
              upcomingJobs.map(job => (
                <div key={job.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest truncate">{format(parseISO(job.startDate), 'dd MMM')}</p>
                    <p className="text-xs font-black text-slate-900 truncate">{job.description}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">{job.location}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <Link to={`/jobs/${job.id}`} className="bg-slate-900 text-white w-8 h-8 rounded-lg flex items-center justify-center hover:bg-indigo-600 transition-colors">
                      <i className="fa-solid fa-arrow-right text-[10px]"></i>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Box 3: Financial Year Revenue */}
        <div className="bg-indigo-600 rounded-[40px] p-8 shadow-xl text-white flex flex-col justify-between h-[380px]">
          <div>
            <p className="text-indigo-200 text-[10px] font-black uppercase tracking-widest">Financial Performance</p>
            <h3 className="text-xl font-black mt-1">Current Fiscal Year</h3>
          </div>
          
          <div className="py-8 text-center">
            <p className="text-6xl font-black tracking-tighter leading-none mb-4">{formatCurrency(revStats.ytdRevenue)}</p>
            <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Year-to-Date Gross Net</p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center text-[10px] font-black uppercase">
              <span>Goal Progress</span>
              <span>{Math.round(revStats.percentOfGoal)}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white transition-all duration-1000" style={{ width: `${revStats.percentOfGoal}%` }}></div>
            </div>
            <p className="text-[9px] text-indigo-200 font-bold uppercase tracking-tighter opacity-70">Projected Year-End: {formatCurrency(revStats.projectedAnnual)}</p>
          </div>
        </div>
      </div>

      {/* Middle Section: Calendar */}
      <div className="h-[750px]">
        <Calendar jobs={state.jobs} externalEvents={state.externalEvents} clients={state.clients} />
      </div>

      {/* Bottom Section: Pie Chart & Client List */}
      <div className="bg-white rounded-[40px] border border-slate-200 p-10 shadow-sm">
        <div className="flex flex-col md:flex-row gap-12 items-center">
          {/* Pie Chart (Left) */}
          <div className="w-full md:w-1/2 h-[400px]">
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-8">Revenue Distribution</h4>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie
                  data={revenueByClientData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={8}
                  dataKey="value"
                  animationDuration={1500}
                >
                  {revenueByClientData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Client List (Right) */}
          <div className="w-full md:w-1/2 flex flex-col h-[400px]">
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-8">Top Revenue Accounts</h4>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-4">
              {revenueByClientData.length === 0 ? (
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center py-20">No revenue data in archive</p>
              ) : (
                revenueByClientData.map((client, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-[24px] hover:border-indigo-200 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                        {client.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{client.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Rank #{idx + 1}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-slate-900 tracking-tight">{formatCurrency(client.value)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};