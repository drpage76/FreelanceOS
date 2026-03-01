
import React, { useState, useMemo, useEffect } from 'react';
import { AppState, Quote, QuoteStatus, Client, JobItem, JobStatus, SchedulingType, Job } from '../types';
import { DB, generateId } from '../services/db';
import { formatCurrency, formatDate, generateJobId } from '../utils';
// Use direct named imports from react-router to resolve missing export errors in unified environments
import { Link, useNavigate } from 'react-router';

interface QuotesProps {
  state: AppState;
  onRefresh: () => void;
}

export const Quotes: React.FC<QuotesProps> = ({ state, onRefresh }) => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  
  const [formData, setFormData] = useState({
    clientId: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [{ id: generateId(), description: 'Professional Services', qty: 1, unitPrice: 0 }]
  });

  const totalAmount = useMemo(() => {
    return formData.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
  }, [formData.items]);

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { id: generateId(), description: '', qty: 1, unitPrice: 0 }]
    });
  };

  const handleUpdateItem = (idx: number, field: string, val: any) => {
    const next = [...formData.items];
    (next[idx] as any)[field] = val;
    setFormData({ ...formData, items: next });
  };

  const handleRemoveItem = (idx: number) => {
    if (formData.items.length === 1) return;
    setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || !formData.description) return;
    
    setIsProcessing('saving');
    try {
      const quote: Quote = {
        id: editingQuote?.id || `Q-${Date.now().toString().slice(-6)}`,
        clientId: formData.clientId,
        description: formData.description,
        date: formData.date,
        expiryDate: formData.expiryDate,
        status: editingQuote?.status || QuoteStatus.DRAFT,
        totalAmount,
        tenant_id: state.user?.email || '',
        items: formData.items as JobItem[]
      };
      
      await DB.saveQuote(quote);
      // Save items associated with the quote if we were to strictly follow job items pattern
      // for now we store them in the quote object as it's cleaner for Lite
      
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      alert("Failed to save quote.");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleConvertToJob = async (quote: Quote) => {
    if (!window.confirm("Convert this accepted quote into an active project?")) return;
    setIsProcessing(quote.id);
    try {
      // Fix: Call generateJobId with 1 argument as per its definition in utils.ts
      const jobId = generateJobId(quote.date);
      const newJob: Job = {
        id: jobId,
        clientId: quote.clientId,
        description: quote.description,
        location: 'TBD',
        startDate: quote.date,
        endDate: quote.date,
        status: JobStatus.CONFIRMED,
        totalRecharge: quote.totalAmount,
        totalCost: 0,
        tenant_id: quote.tenant_id,
        schedulingType: SchedulingType.CONTINUOUS,
        syncToCalendar: true
      };
      
      await DB.saveJob(newJob);
      if (quote.items) {
        const jobItems = quote.items.map(it => ({ ...it, jobId, rechargeAmount: it.qty * it.unitPrice }));
        await DB.saveJobItems(jobId, jobItems);
      }
      
      await DB.saveQuote({ ...quote, status: QuoteStatus.ACCEPTED });
      onRefresh();
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      alert("Conversion failed.");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Delete this quote?")) {
      await DB.deleteQuote(id);
      onRefresh();
    }
  };

  const openAddModal = () => {
    setEditingQuote(null);
    setFormData({
      clientId: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [{ id: generateId(), description: 'Professional Services', qty: 1, unitPrice: 0 }]
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 leading-none">Estimations & Quotes</h2>
          <p className="text-slate-500 font-medium mt-1">Formalize your proposals and secure new contracts.</p>
        </div>
        <button onClick={openAddModal} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-2">
           <i className="fa-solid fa-plus"></i> New Estimate
        </button>
      </header>

      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <th className="p-6">Reference</th>
              <th className="p-6">Client / Project</th>
              <th className="p-6">Issue Date</th>
              <th className="p-6">Expires</th>
              <th className="p-6">Status</th>
              <th className="p-6 text-right">Valuation</th>
              <th className="p-6 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {state.quotes.length === 0 ? (
              <tr><td colSpan={7} className="p-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs">No estimations recorded</td></tr>
            ) : (
              state.quotes.map(quote => {
                const client = state.clients.find(c => c.id === quote.clientId);
                return (
                  <tr key={quote.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6 font-black text-xs text-indigo-600">{quote.id}</td>
                    <td className="p-6">
                      <p className="font-black text-slate-900 text-sm leading-tight">{quote.description}</p>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-tight mt-1">{client?.name || 'Private Client'}</p>
                    </td>
                    <td className="p-6 text-xs font-bold text-slate-600">{formatDate(quote.date)}</td>
                    <td className="p-6 text-xs font-bold text-slate-600">{formatDate(quote.expiryDate)}</td>
                    <td className="p-6">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase border ${
                        quote.status === QuoteStatus.ACCEPTED ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        quote.status === QuoteStatus.SENT ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                        'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>
                        {quote.status}
                      </span>
                    </td>
                    <td className="p-6 text-right font-black text-slate-900">{formatCurrency(quote.totalAmount)}</td>
                    <td className="p-6">
                      <div className="flex items-center justify-center gap-2">
                        {quote.status !== QuoteStatus.ACCEPTED && (
                          <button onClick={() => handleConvertToJob(quote)} disabled={isProcessing === quote.id} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2">
                            {isProcessing === quote.id ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-check"></i>} Confirm Job
                          </button>
                        )}
                        <button onClick={() => handleDelete(quote.id)} className="w-9 h-9 flex items-center justify-center bg-slate-100 text-slate-400 rounded-xl hover:text-rose-500 transition-colors"><i className="fa-solid fa-trash-can text-xs"></i></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 my-auto overflow-hidden">
             <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-2xl font-black text-slate-900">Create Estimation</h3>
                <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:text-rose-500"><i className="fa-solid fa-xmark"></i></button>
             </div>
             <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Target Client</label>
                  <select required value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none">
                    <option value="">Select recipient...</option>
                    {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Project Description</label>
                  <input required placeholder="Project Name / Brief" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Issue Date</label>
                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Valid Until</label>
                    <input type="date" value={formData.expiryDate} onChange={e => setFormData({...formData, expiryDate: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-50">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Line Items</label>
                    <button type="button" onClick={handleAddItem} className="text-[9px] font-black text-indigo-600 uppercase">+ Add Row</button>
                  </div>
                  <div className="space-y-2">
                    {formData.items.map((it, idx) => (
                      <div key={it.id} className="grid grid-cols-12 gap-2 p-2 bg-slate-50 border border-slate-100 rounded-xl items-center">
                        <input className="col-span-7 px-3 py-2 bg-white rounded-lg text-xs font-bold outline-none" placeholder="Description" value={it.description} onChange={e => handleUpdateItem(idx, 'description', e.target.value)} />
                        <input type="number" className="col-span-2 px-1 py-2 bg-white rounded-lg text-xs font-black text-center outline-none" value={it.qty} onChange={e => handleUpdateItem(idx, 'qty', parseFloat(e.target.value) || 0)} />
                        <input type="number" className="col-span-2 px-1 py-2 bg-white rounded-lg text-xs font-black text-right outline-none" value={it.unitPrice} onChange={e => handleUpdateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                        <button type="button" onClick={() => handleRemoveItem(idx)} className="col-span-1 text-slate-200 hover:text-rose-500"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-8 border-t border-slate-100 sticky bottom-0 bg-white pb-2">
                   <div className="flex flex-col">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Estimate</p>
                      <p className="text-3xl font-black text-indigo-600">{formatCurrency(totalAmount)}</p>
                   </div>
                   <button type="submit" disabled={isProcessing === 'saving'} className="px-10 py-4 bg-slate-900 text-white rounded-[24px] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center gap-2">
                      {isProcessing === 'saving' ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>}
                      {editingQuote ? 'Update Estimate' : 'Issue Estimate'}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};
