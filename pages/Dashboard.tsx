import React, { useMemo } from 'react';
// Use direct named imports from react-router-dom to avoid property access errors
import { Link } from 'react-router-dom';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import { parseISO, isAfter, startOfDay, addDays, isBefore, isValid, format, differenceInDays } from 'date-fns';

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
  const revStats = useMemo(() => calculateRevenueStats(state.jobs, state.user, 60000), [state.jobs, state.user]);

  const nextPayment = useMemo(() => {
    const today = startOfDay(new Date());
    return state.invoices
      .filter(inv => inv.status !== InvoiceStatus.PAID)
      .map(inv => {
        const job = state.jobs.find(j => j.id === inv.jobId);
        const client = state.clients.find(c => c.id === job?.clientId);
        const daysRemaining = differenceInDays(parseISO(inv.dueDate), today);
        return { ...inv, job, client, daysRemaining };
      })
      .filter(inv => isValid(parseISO(inv.dueDate)) && (isAfter(parseISO(inv.dueDate), today) || isSameDay(parseISO(inv.dueDate), today)))
      .sort((a, b) => a.daysRemaining - b.daysRemaining)[0];
  }, [state.invoices, state.jobs, state.clients]);

  const nextJob = useMemo(() => {
    const today = startOfDay(new Date());
    return state.jobs
      .filter(job => job.status !== JobStatus.CANCELLED && job.status !== JobStatus.COMPLETED)
      .filter(job => isValid(parseISO(job.startDate)) && (isAfter(parseISO(job.startDate), today) || isSameDay(parseISO(job.startDate), today)))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];
  }, [state.jobs]);

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
    <div className="flex flex-col gap-3 max-w-screen-2xl mx-auto pb-4 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight italic">Command Center</h2>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Business Intelligence Hub</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onSyncCalendar} disabled={isSyncing} className="bg-white text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center shadow-sm disabled:opacity-50">
            {isSyncing ? <i className="fa-solid fa-spinner animate-spin mr-2"></i> : <i className="fa-solid fa-rotate mr-2 text-indigo-600"></i>}
            Sync
          </button>
          <button onClick={onNewJobClick} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg hover:bg-black transition-all flex items-center">
            <i className="fa-solid fa-plus mr-2"></i>New Project
          </button>
        </div>
      </header>

      {/* Top Row: Cards height strictly 100px */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-[24px] border border-slate-200 p-4 shadow-sm flex flex-col h-[100px] justify-between">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest">Next Payment</p>
            <Link to="/invoices" className="text-indigo-600 text-[8px] font-black uppercase">Manage</Link>
          </div>
          {nextPayment ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-900 truncate">{nextPayment.client?.name}</p>
                <p className="text-[9px] font-bold text-slate-400 truncate">{nextPayment.job?.description}</p>
              </div>
              <p className="text-sm font-black text-slate-900 ml-4">{formatCurrency(nextPayment.job?.totalRecharge || 0, state.user)}</p>
            </div>
          ) : (
            <p className="text-[10px] text-slate-300 font-black uppercase text-center py-1">No pending payments</p>
          )}
        </div>

        <div className="bg-white rounded-[24px] border border-slate-200 p-4 shadow-sm flex flex-col h-[100px] justify-between">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest">Next Job</p>
            <Link to="/jobs" className="text-emerald-600 text-[8px] font-black uppercase">Archive</Link>
          </div>
          {nextJob ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-900 truncate">{nextJob.description}</p>
                <p className="text-[9px] font-bold text-slate-400 truncate">{format(parseISO(nextJob.startDate), 'dd MMM')}</p>
              </div>
              <Link to={`/jobs/${nextJob.id}`} className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center"><i className="fa-solid fa-arrow-right text-[10px]"></i></Link>
            </div>
          ) : (
            <p className="text-[10px] text-slate-300 font-black uppercase text-center py-1">No upcoming production</p>
          )}
        </div>

        <div className="bg-slate-900 rounded-[24px] p-4 shadow-xl text-white flex flex-col justify-between h-[100px] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-10"><i className="fa-solid fa-chart-line text-5xl"></i></div>
          <div className="relative z-10">
            <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest italic leading-none">
              Fiscal Year Rev (Starts {state.user?.fiscalYearStartDay}/{state.user?.fiscalYearStartMonth})
            </p>
            <p className="text-2xl font-black tracking-tighter mt-1">{formatCurrency(revStats.ytdRevenue, state.user)}</p>
          </div>
          <div className="relative z-10">
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${revStats.percentOfGoal}%` }}></div>
            </div>
            <p className="text-[7px] text-slate-500 font-black uppercase">Run-rate: {formatCurrency(revStats.dailyRunRate, state.user)}/d</p>
          </div>
        </div>
      </div>

      <div className="h-[450px]">
        <Calendar jobs={state.jobs} externalEvents={state.externalEvents} clients={state.clients} />
      </div>

      {/* Bottom Analytics */}
      <div className="bg-white rounded-[24px] border border-slate-200 p-4 shadow-sm h-[260px] overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-4 h-full">
          <div className="w-full lg:w-1/3 h-full flex flex-col border-r border-slate-50 pr-4">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Portfolio Split</p>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueByClientData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {revenueByClientData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip wrapperStyle={{fontSize: '9px', fontWeight: 'bold', borderRadius: '8px'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="w-full lg:w-2/3 flex flex-col h-full overflow-hidden">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Active Account Ledger</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 overflow-y-auto custom-scrollbar pr-2">
              {revenueByClientData.map((client, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-white font-black text-[7px]" style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                      {client.name.charAt(0)}
                    </div>
                    <p className="text-[10px] font-black text-slate-900 truncate">{client.name}</p>
                  </div>
                  <p className="text-[10px] font-black text-slate-900 ml-2 shrink-0">{formatCurrency(client.value, state.user)}</p>
                </div>
              ))}
              {revenueByClientData.length === 0 && <p className="text-[9px] text-slate-300 uppercase py-4 col-span-2 text-center">No accounts recorded</p>}
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