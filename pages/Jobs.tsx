
import React, { useState, useMemo } from 'react';
// Use direct named imports from react-router-dom to avoid property access errors
import { Link, useNavigate } from 'react-router-dom';

import { AppState, JobStatus, InvoiceStatus, Invoice, Job, Client } from '../types';
import { formatCurrency, formatDate, calculateDueDate, generateInvoiceId } from '../utils';
import { STATUS_COLORS } from '../constants';
import { DB } from '../services/db';

interface JobsProps {
  state: AppState;
  onNewJobClick: () => void;
  onRefresh: () => void;
}

export const Jobs: React.FC<JobsProps> = ({ state, onNewJobClick, onRefresh }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<JobStatus | 'All'>('All');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const [invoicePrompt, setInvoicePrompt] = useState<{job: Job, client: Client} | null>(null);
  const [promptDate, setPromptDate] = useState('');

  const filteredJobs = useMemo(() => {
    return state.jobs.filter(job => {
      const client = state.clients.find(c => c.id === job.clientId);
      const matchesSearch = job.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            job.id.includes(searchTerm) ||
                            job.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (client?.name.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesFilter = filter === 'All' || job.status === filter;
      return matchesSearch && matchesFilter;
    }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [state.jobs, state.clients, searchTerm, filter]);

  const startQuickInvoice = (jobId: string) => {
    const job = state.jobs.find(j => j.id === jobId);
    const client = state.clients.find(c => c.id === job?.clientId);
    if (job && client) {
      setInvoicePrompt({ job, client });
      setPromptDate(job.endDate);
    }
  };

  const handleFinalizeQuickInvoice = async () => {
    if (!invoicePrompt || !promptDate) return;

    setIsProcessing(invoicePrompt.job.id);
    try {
      const invoices = await DB.getInvoices();
      const terms = parseInt(invoicePrompt.client.paymentTermsDays as any) || 30;
      
      const newInvoice: Invoice = {
        id: generateInvoiceId(state.user),
        jobId: invoicePrompt.job.id,
        date: promptDate,
        dueDate: calculateDueDate(promptDate, terms),
        status: InvoiceStatus.DRAFT,
        tenant_id: invoicePrompt.job.tenant_id
      };
      await DB.saveInvoice(newInvoice);
      await onRefresh();
      navigate('/invoices');
    } catch (err) {
      alert("Failed to generate invoice.");
    } finally {
      setIsProcessing(null);
      setInvoicePrompt(null);
    }
  };

  const handleDeleteJob = async (id: string, description: string) => {
    if (window.confirm(`Are you sure you want to permanently delete project: "${description}"? This will also remove all associated items and shifts.`)) {
      setIsProcessing(id);
      try {
        await DB.deleteJob(id);
        await onRefresh();
      } catch (err) {
        alert("Delete failed. Cloud synchronization error.");
      } finally {
        setIsProcessing(null);
      }
    }
  };

  return (
    <div className="space-y-6 pb-20 px-4">
      {invoicePrompt && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
           <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
              <h3 className="text-xl font-black text-slate-900 mb-2">Issue Project Invoice</h3>
              <p className="text-sm text-slate-500 font-medium mb-6">Confirm issue date for {invoicePrompt.client.name}.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Date of Issue</label>
                  <input type="date" value={promptDate} onChange={(e) => setPromptDate(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setInvoicePrompt(null)} className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase border border-slate-100">Cancel</button>
                  <button onClick={handleFinalizeQuickInvoice} disabled={!!isProcessing} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2">
                    {isProcessing ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-file-invoice-dollar"></i>}
                    {isProcessing ? 'Handoff...' : 'Create Draft'}
                  </button>
                </div>
              </div>
           </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 leading-tight">Project Workspace</h2>
          <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.3em]">Full Operational Ledger</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Filter archives..." 
              className="pl-12 pr-6 py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-black outline-none w-full md:w-80 shadow-sm focus:ring-4 focus:ring-indigo-500/5 transition-all"
            />
          </div>
          <button onClick={onNewJobClick} className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black shadow-xl hover:bg-black transition-all text-[10px] uppercase tracking-widest flex items-center justify-center">
            <i className="fa-solid fa-plus mr-2"></i>Create New Job
          </button>
        </div>
      </header>

      <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden min-h-[600px] flex flex-col">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-20">
              <tr>
                <th className="p-8 text-[9px] font-black text-slate-400 uppercase tracking-widest">Client Identity</th>
                <th className="p-8 text-[9px] font-black text-slate-400 uppercase tracking-widest">Project & Venue</th>
                <th className="p-8 text-[9px] font-black text-slate-400 uppercase tracking-widest">Production Date</th>
                <th className="p-8 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="p-8 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Revenue</th>
                <th className="p-8 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-32 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">No matching records in archive</td>
                </tr>
              ) : (
                filteredJobs.map(job => {
                  const client = state.clients.find(c => c.id === job.clientId);
                  const hasInvoice = state.invoices.some(inv => inv.jobId === job.id);
                  const isBusy = isProcessing === job.id;

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-8">
                        <span className="font-black text-slate-900 text-sm block mb-1">{client?.name || 'Private Client'}</span>
                        <span className="text-[9px] text-indigo-400 font-black uppercase tracking-widest">ID: {job.id}</span>
                      </td>
                      <td className="p-8">
                        <Link to={`/jobs/${job.id}`} className="font-black text-slate-900 hover:text-indigo-600 transition-colors block text-[15px] mb-2">{job.description}</Link>
                        <span className="text-[10px] text-slate-400 font-black uppercase flex items-center gap-2">
                          <i className="fa-solid fa-location-dot text-indigo-400"></i> {job.location || 'TBD'}
                        </span>
                      </td>
                      <td className="p-8">
                        <p className="text-xs font-black text-slate-900">{formatDate(job.startDate)}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-1 italic">TO {formatDate(job.endDate)}</p>
                      </td>
                      <td className="p-8">
                        <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase border ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                      </td>
                      <td className="p-8 text-right font-black text-slate-900 text-lg tracking-tight">{formatCurrency(job.totalRecharge, state.user)}</td>
                      <td className="p-8">
                        <div className="flex items-center justify-center gap-3">
                          <Link to={`/jobs/${job.id}`} className="bg-slate-900 text-white w-11 h-11 flex items-center justify-center rounded-[18px] hover:bg-indigo-600 transition-all shadow-md" title="Open Workspace">
                            <i className="fa-solid fa-eye text-xs"></i>
                          </Link>
                          {!hasInvoice && job.status !== JobStatus.CANCELLED && (
                            <button onClick={() => startQuickInvoice(job.id)} className="bg-emerald-50 text-emerald-600 border border-emerald-100 w-11 h-11 flex items-center justify-center rounded-[18px] hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="Issue Quick Invoice">
                              <i className="fa-solid fa-file-invoice-dollar text-xs"></i>
                            </button>
                          )}
                          <button 
                            disabled={isBusy}
                            onClick={() => handleDeleteJob(job.id, job.description)} 
                            className="bg-white text-slate-300 border border-slate-200 w-11 h-11 flex items-center justify-center rounded-[18px] hover:text-rose-500 hover:border-rose-200 transition-all shadow-sm" 
                            title="Delete Project"
                          >
                            {isBusy ? <i className="fa-solid fa-spinner animate-spin text-[10px]"></i> : <i className="fa-solid fa-trash-can text-xs"></i>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
