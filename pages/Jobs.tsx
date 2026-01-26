
import React, { useState, useMemo } from 'react';
// Fix: Use namespace import for react-router-dom to resolve exported member errors
import * as ReactRouterDOM from 'react-router-dom';

const { Link, useNavigate } = ReactRouterDOM;

import { AppState, JobStatus, InvoiceStatus, Invoice, Job, Client } from '../types';
import { formatCurrency, formatDate, calculateDueDate, generateInvoiceId } from '../utils';
import { STATUS_COLORS } from '../constants';
import { DB } from '../services/db';

interface JobsProps {
  state: AppState;
  onNewJobClick: () => void;
  onRefresh: () => void;
}

const ITEMS_PER_PAGE = 10;

export const Jobs: React.FC<JobsProps> = ({ state, onNewJobClick, onRefresh }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<JobStatus | 'All'>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const [invoicePrompt, setInvoicePrompt] = useState<{job: Job, client: Client} | null>(null);
  const [promptDate, setPromptDate] = useState('');

  const stats = useMemo(() => {
    return {
      total: state.jobs.length,
      confirmed: state.jobs.filter(j => j.status === JobStatus.CONFIRMED).length,
      pending: state.jobs.filter(j => j.status === JobStatus.PENCILLED || j.status === JobStatus.POTENTIAL).length,
      revenue: state.jobs.reduce((sum, j) => sum + (j.status !== JobStatus.CANCELLED ? j.totalRecharge : 0), 0)
    };
  }, [state.jobs]);

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

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
        id: generateInvoiceId(invoices.length + 1),
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

  return (
    <div className="space-y-4">
      {invoicePrompt && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
           <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
              <h3 className="text-xl font-black text-slate-900 mb-2">Generate Project Invoice</h3>
              <p className="text-sm text-slate-500 font-medium mb-6">Confirm issue date for {invoicePrompt.client.name}. Terms: {invoicePrompt.client.paymentTermsDays} Days.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Issue Date</label>
                  <input type="date" value={promptDate} onChange={(e) => setPromptDate(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setInvoicePrompt(null)} className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase border border-slate-100">Cancel</button>
                  <button onClick={handleFinalizeQuickInvoice} disabled={!!isProcessing} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2">
                    {isProcessing ? <i className="fa-solid fa-spinner animate-spin"></i> : 'Create Draft'}
                  </button>
                </div>
              </div>
           </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 leading-tight">Project Workspace</h2>
          <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.2em]">Full Ledger & Archives</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input 
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Filter archives..." 
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none w-full md:w-64"
            />
          </div>
          <button onClick={onNewJobClick} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black shadow-lg hover:bg-indigo-700 transition-all text-xs flex items-center justify-center">
            <i className="fa-solid fa-plus mr-2"></i>Create New Job
          </button>
        </div>
      </header>

      <div className="bg-white rounded-[24px] border border-slate-200 overflow-hidden shadow-sm flex flex-col h-full min-h-[600px]">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Client / Entity</th>
                <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Project & Venue</th>
                <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Production Date</th>
                <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Revenue</th>
                <th className="p-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">No matching records found</td>
                </tr>
              ) : (
                paginatedJobs.map(job => {
                  const client = state.clients.find(c => c.id === job.clientId);
                  const hasInvoice = state.invoices.some(inv => inv.jobId === job.id);
                  return (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-6">
                        <span className="font-black text-slate-900 text-[13px] block">{client?.name || 'Unknown Client'}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">ID: {job.id}</span>
                      </td>
                      <td className="p-6">
                        <Link to={`/jobs/${job.id}`} className="font-black text-slate-900 hover:text-indigo-600 transition-colors block text-[13px] mb-1">{job.description}</Link>
                        <span className="text-[10px] text-slate-400 font-black uppercase flex items-center gap-1">
                          <i className="fa-solid fa-location-dot text-indigo-400"></i> {job.location || 'Location Not Set'}
                        </span>
                      </td>
                      <td className="p-6">
                        <p className="text-[11px] font-black text-slate-700">{formatDate(job.startDate)}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">TO {formatDate(job.endDate)}</p>
                      </td>
                      <td className="p-6">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase border ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                      </td>
                      <td className="p-6 text-right font-black text-slate-900 text-sm">{formatCurrency(job.totalRecharge)}</td>
                      <td className="p-6">
                        <div className="flex items-center justify-center gap-2">
                          <Link to={`/jobs/${job.id}`} className="bg-slate-900 text-white w-9 h-9 flex items-center justify-center rounded-xl hover:bg-indigo-600 transition-all">
                            <i className="fa-solid fa-eye text-xs"></i>
                          </Link>
                          {!hasInvoice && job.status !== JobStatus.CANCELLED && (
                            <button onClick={() => startQuickInvoice(job.id)} className="bg-emerald-50 text-emerald-600 border border-emerald-100 w-9 h-9 flex items-center justify-center rounded-xl hover:bg-emerald-600 hover:text-white transition-all">
                              <i className="fa-solid fa-file-invoice-dollar text-xs"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Showing Page {currentPage} of {totalPages}</p>
             <div className="flex gap-2">
                <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 disabled:opacity-30">Prev</button>
                <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 disabled:opacity-30">Next</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
