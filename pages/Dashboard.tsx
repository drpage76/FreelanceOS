import React, { useMemo, useState } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip
} from 'recharts';
import { parseISO, isAfter, startOfDay, addDays, isBefore, isValid, format } from 'date-fns';

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
        return { ...inv, job, client };
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [state.invoices, state.jobs, state.clients, dueFilterDays]);

  const jobDistributionData = useMemo(() => {
    const counts: Record<string, number> = {};
    state.jobs.forEach(j => {
      counts[j.status] = (counts[j.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
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
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5 clients
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm group">
           <div className="flex items-center justify-between mb-4">
             <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Active Pipeline</p>
             <i className="fa-solid fa-briefcase text-slate-300 group-hover:text-indigo-600 transition-colors"></i>
           </div>
           <p className="text-4xl font-black text-slate-900">{state.jobs.filter(j => j.status === JobStatus.CONFIRMED).length}</p>
           <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Projects in progress</p>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm group">
           <div className="flex items-center justify-between mb-4">
             <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Awaiting Payment</p>
             <i className="fa-solid fa-clock-rotate-left text-slate-300 group-hover:text-rose-500 transition-colors"></i>
           </div>
           <p className="text-4xl font-black text-slate-900">{state.invoices.filter(i => i.status !== InvoiceStatus.PAID).length}</p>
           <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase">Pending Settlements</p>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
           <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">Year-to-Date Net</p>
           <p className="text-4xl font-black text-slate-900">{formatCurrency(revStats.ytdRevenue)}</p>
           <div className="w-full h-1 bg-slate-100 rounded-full mt-4 overflow-hidden">
             <div className="h-full bg-indigo-600" style={{ width: `${revStats.percentOfGoal}%` }}></div>
           </div>
        </div>

        <div className="bg-indigo-600 p-6 rounded-[32px] shadow-xl text-white">
           <p className="text-indigo-200 text-[10px] font-black uppercase tracking-widest mb-4">Projected Annual</p>
           <p className="text-4xl font-black">{formatCurrency(revStats.projectedAnnual)}</p>
           <p className="text-[9px] font-bold text-indigo-300 mt-4 uppercase">Run-rate forecast</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-12 flex flex-col gap-6">
           {/* Next Payment Due Section */}
           <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm">
             <div className="flex items-center justify-between mb-8">
               <div>
                 <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Next Payments Due</h3>
                 <p className="text-[10px] text-slate-400 font-bold mt-1">Cashflow forecasting ledger</p>
               </div>
               <div className="flex items-center gap-3">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Forecast Range:</label>
                 <select 
                    value={dueFilterDays} 
                    onChange={(e) => setDueFilterDays(Number(e.target.value))}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none"
                 >
                   <option value={7}>Next 7 Days</option>
                   <option value={14}>Next 14 Days</option>
                   <option value={30}>Next 30 Days</option>
                   <option value={60}>Next 60 Days</option>
                 </select>
               </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {upcomingPayments.length === 0 ? (
                 <div className="col-span-full py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-center">
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No payments due within this window</p>
                 </div>
               ) : (
                 upcomingPayments.map(inv => (
                   <div key={inv.id} className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-between group hover:border-indigo-200 transition-colors">
                     <div className="flex-1">
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{inv.client?.name}</p>
                        <p className="text-sm font-black text-slate-900 truncate">{inv.job?.description}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-2">Due in {Math.ceil((new Date(inv.dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))} days</p>
                     </div>
                     <div className="text-right ml-4">
                        <p className="text-lg font-black text-slate-900">{formatCurrency(inv.job?.totalRecharge || 0)}</p>
                        <Link to={`/invoices`} className="text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">View Link</Link>
                     </div>
                   </div>
                 ))
               )}
             </div>
           </div>

           <div className="h-[600px]">
              <Calendar jobs={state.jobs} externalEvents={state.externalEvents} clients={state.clients} />
           </div>

           {/* Pie Charts Row */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm h-[400px] flex flex-col">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Job Status Distribution</h4>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={jobDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {jobDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-sm h-[400px] flex flex-col">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Revenue by Client (Top 5)</h4>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueByClientData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {revenueByClientData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};