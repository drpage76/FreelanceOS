
import React, { useMemo, useState } from 'react';
// Use direct named imports from react-router to resolve missing Link export in unified environments
import { Link } from 'react-router';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import { parseISO, isAfter, startOfDay, addDays, isBefore, isValid, format, differenceInDays, isSameDay } from 'date-fns';

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
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAllJobs, setShowAllJobs] = useState(false);

  const revStats = useMemo(() => calculateRevenueStats(state.jobs, state.user, 60000), [state.jobs, state.user]);

  const allPendingPayments = useMemo(() => {
    const today = startOfDay(new Date());
    return state.invoices
      .filter(inv => inv.status !== InvoiceStatus.PAID)
      .map(inv => {
        const job = state.jobs.find(j => j.id === inv.jobId);
        const client = state.clients.find(c => c.id === job?.clientId);
        const daysRemaining = differenceInDays(parseISO(inv.dueDate), today);
        return { ...inv, job, client, daysRemaining };
      })
      // CRITICAL: Filter out invoices where the job no longer exists (due to deletion ghosts)
      .filter(p => p.job !== undefined)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [state.invoices, state.jobs, state.clients]);

  const allUpcomingJobs = useMemo(() => {
    const today = startOfDay(new Date());
    return state.jobs
      .filter(job => job.status !== JobStatus.CANCELLED && job.status !== JobStatus.COMPLETED)
      .filter(job => isValid(parseISO(job.startDate)) && (isAfter(parseISO(job.startDate), today) || isSameDay(parseISO(job.startDate), today)))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [state.jobs]);

  const nextPayment = allPendingPayments[0];
  const nextJob = allUpcomingJobs[0];

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
    <div className="flex flex-col gap-4 max-w-screen-2xl mx-auto pb-10 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight italic">Operations Hub</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Real-time Financials & Scheduling</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onSyncCalendar} disabled={isSyncing} className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center shadow-sm disabled:opacity-50">
            {isSyncing ? <i className="fa-solid fa-spinner animate-spin mr-2"></i> : <i className="fa-solid fa-rotate mr-2 text-indigo-600"></i>}
            Sync Cloud
          </button>
          <button onClick={onNewJobClick} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-black transition-all flex items-center">
            <i className="fa-solid fa-plus mr-2"></i>Start New Project
          </button>
        </div>
      </header>

      {/* Top Row: Cards with in-place expansion */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Box 1: Payments */}
        <div className={`bg-white rounded-[28px] border border-slate-200 p-5 shadow-sm flex flex-col transition-all duration-300 ${showAllPayments ? 'min-h-[250px]' : 'h-[110px]'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest">Accounts Receivable</p>
            <button onClick={() => setShowAllPayments(!showAllPayments)} className="text-indigo-600 text-[9px] font-black uppercase hover:underline">
              {showAllPayments ? 'Collapse' : 'Show All'}
            </button>
          </div>
          
          {showAllPayments ? (
            <div className="space-y-3 mt-2 custom-scrollbar overflow-y-auto max-h-[300px]">
              {allPendingPayments.map(p => (
                <div key={p.id} className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 truncate">{p.client?.name}</p>
                    <p className="text-[9px] font-bold text-slate-400">Due {format(parseISO(p.dueDate), 'dd MMM')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-black text-slate-900">{formatCurrency(p.job?.totalRecharge || 0, state.user)}</p>
                    <p className="text-[8px] font-black text-indigo-500 uppercase">{p.daysRemaining} days left</p>
                  </div>
                </div>
              ))}
              {allPendingPayments.length === 0 && <p className="text-[10px] text-slate-300 font-black text-center py-4 uppercase tracking-widest">No due payments</p>}
            </div>
          ) : (
            nextPayment ? (
              <div className="flex items-center justify-between flex-1">
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-slate-900 truncate leading-tight">{nextPayment.client?.name}</p>
                  <p className="text-[10px] font-black text-indigo-500 uppercase mt-0.5">{nextPayment.daysRemaining} days remaining</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-lg font-black text-slate-900 tracking-tighter">{formatCurrency(nextPayment.job?.totalRecharge || 0, state.user)}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">By {format(parseISO(nextPayment.dueDate), 'dd MMM')}</p>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-300 font-black uppercase text-center py-4 tracking-widest">All settled</p>
            )
          )}
        </div>

        {/* Box 2: Next Job */}
        <div className={`bg-white rounded-[28px] border border-slate-200 p-5 shadow-sm flex flex-col transition-all duration-300 ${showAllJobs ? 'min-h-[250px]' : 'h-[110px]'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest">Production Queue</p>
            <button onClick={() => setShowAllJobs(!showAllJobs)} className="text-emerald-600 text-[9px] font-black uppercase hover:underline">
              {showAllJobs ? 'Collapse' : 'Show All'}
            </button>
          </div>
          
          {showAllJobs ? (
            <div className="space-y-3 mt-2 custom-scrollbar overflow-y-auto max-h-[300px]">
              {allUpcomingJobs.map(j => {
                const client = state.clients.find(c => c.id === j.clientId);
                return (
                  <Link to={`/jobs/${j.id}`} key={j.id} className="flex items-center justify-between border-b border-slate-50 pb-2 hover:bg-slate-50 rounded px-1">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-slate-900 truncate">{j.description}</p>
                      <p className="text-[9px] font-bold text-slate-400">{client?.name}</p>
                    </div>
                    <p className="text-[9px] font-black text-emerald-600 uppercase text-right shrink-0">{format(parseISO(j.startDate), 'dd MMM')}</p>
                  </Link>
                );
              })}
              {allUpcomingJobs.length === 0 && <p className="text-[10px] text-slate-300 font-black text-center py-4 uppercase tracking-widest">Queue empty</p>}
            </div>
          ) : (
            nextJob ? (
              <div className="flex items-center justify-between flex-1">
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-slate-900 truncate leading-tight">{nextJob.description}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 truncate">
                    {state.clients.find(c => c.id === nextJob.clientId)?.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900 tracking-tighter">{format(parseISO(nextJob.startDate), 'dd MMM')}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase leading-none">Production start</p>
                  </div>
                  <Link to={`/jobs/${nextJob.id}`} className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center hover:bg-black transition-all">
                    <i className="fa-solid fa-arrow-right text-[10px]"></i>
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-300 font-black uppercase text-center py-4 tracking-widest">No upcoming work</p>
            )
          )}
        </div>

        {/* Box 3: Financial Summary */}
        <div className="bg-slate-900 rounded-[28px] p-5 shadow-xl text-white flex flex-col justify-between h-[110px] relative overflow-hidden">
          <div className="absolute top-[-10px] right-[-10px] p-2 opacity-5"><i className="fa-solid fa-chart-line text-7xl"></i></div>
          <div className="relative z-10">
            <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest italic leading-none">
              Financial Performance (YTD)
            </p>
            <p className="text-2xl font-black tracking-tighter mt-1">{formatCurrency(revStats.ytdRevenue, state.user)}</p>
          </div>
          <div className="relative z-10">
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${revStats.percentOfGoal}%` }}></div>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-[7px] text-slate-500 font-black uppercase italic">Run-rate: {formatCurrency(revStats.dailyRunRate, state.user)}/day</p>
              <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">{revStats.percentOfGoal.toFixed(0)}% of Goal</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Calendar: No scroll, fully visible */}
      <div className="min-h-[600px] flex flex-col bg-white rounded-[32px] border border-slate-200 shadow-sm">
        <Calendar jobs={state.jobs} externalEvents={state.externalEvents} clients={state.clients} />
      </div>

      {/* Bottom Analytics: Single Column List */}
      <div className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="w-full lg:w-1/3 border-r border-slate-50 pr-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Market Share Portfolio</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueByClientData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {revenueByClientData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip wrapperStyle={{fontSize: '10px', fontWeight: 'bold', borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="w-full lg:w-2/3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Client Ranking by Lifetime Value</p>
            <div className="flex flex-col gap-2">
              {revenueByClientData.map((client, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-md transition-all">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-[10px] shadow-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900 truncate">{client.name}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Active Account</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">{formatCurrency(client.value, state.user)}</p>
                    <p className="text-[8px] font-black text-indigo-500 uppercase">Gross Billing</p>
                  </div>
                </div>
              ))}
              {revenueByClientData.length === 0 && (
                <div className="text-center py-10">
                  <i className="fa-solid fa-users-slash text-slate-100 text-5xl mb-4"></i>
                  <p className="text-[10px] text-slate-300 uppercase tracking-widest font-black">No client records found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
