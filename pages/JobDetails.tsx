
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Job, JobItem, JobStatus, Client, Invoice, InvoiceStatus, JobShift, Tenant, SchedulingType } from '../types';
import { DB, generateId } from '../services/db';
import { formatCurrency, formatDate, calculateDueDate, generateInvoiceId } from '../utils';
import { STATUS_COLORS } from '../constants';
import { syncJobToGoogle } from '../services/googleCalendar';
import { uploadToGoogleDrive } from '../services/googleDrive';

interface JobDetailsProps {
  onRefresh: () => void;
  googleAccessToken?: string;
}

export const JobDetails: React.FC<JobDetailsProps> = ({ onRefresh, googleAccessToken }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [shifts, setShifts] = useState<JobShift[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Tenant | null>(null);
  
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPreview, setShowPreview] = useState<'invoice' | 'quote' | null>(null);
  const [selectedInvoiceDate, setSelectedInvoiceDate] = useState('');
  
  const docRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const user = await DB.getCurrentUser();
      setCurrentUser(user);
      const allJobs = await DB.getJobs();
      const foundJob = allJobs.find(j => j.id === id);
      if (foundJob) {
        setJob(foundJob);
        if (!selectedInvoiceDate) setSelectedInvoiceDate(foundJob.endDate);
        setShifts(foundJob.shifts || []);
        const jobItems = await DB.getJobItems(id);
        setItems(jobItems || []);
        const allClients = await DB.getClients();
        setClient(allClients.find(c => c.id === foundJob.clientId) || null);
        const allInvoices = await DB.getInvoices();
        setInvoice(allInvoices.find(inv => inv.jobId === foundJob.id) || null);
      } else { 
        navigate('/jobs'); 
      }
    } catch (err) { 
      console.error("Fetch Data Protocol Error:", err); 
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const totalRecharge = useMemo(() => items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0), [items]);

  const handleUpdateJob = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!job || isSaving) return;
    setIsSaving(true);
    
    let startDate = job.startDate;
    let endDate = job.endDate;
    if (job.schedulingType === SchedulingType.SHIFT_BASED && shifts.length > 0) {
      const startDates = shifts.map(s => s.startDate).filter(Boolean).sort();
      const endDates = shifts.map(s => s.endDate).filter(Boolean).sort();
      if (startDates.length > 0) startDate = startDates[0]!;
      if (endDates.length > 0) endDate = endDates[endDates.length - 1]!;
    }

    const updatedJob: Job = {
      ...job,
      startDate,
      endDate,
      shifts: shifts
    };

    try {
      // Clear calendar first if needed
      await DB.saveJob(updatedJob);
      await DB.saveJobItems(job.id, items);
      if (googleAccessToken) await syncJobToGoogle(updatedJob, googleAccessToken, client?.name);
      
      // Update local state and global refresh
      setJob(updatedJob);
      await onRefresh();
      
      // Visual feedback
      const btn = document.getElementById('save-feedback');
      if (btn) {
        btn.textContent = 'Changes Saved';
        setTimeout(() => { if (btn) btn.textContent = 'Save Changes'; }, 2000);
      }
    } catch (err: any) { 
      console.error("Save Error:", err);
      alert(`System failed to save changes: ${err.message || 'Check your internet connection.'}`); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const toggleSync = async () => {
    if (!job) return;
    const nextVal = !job.syncToCalendar;
    const updatedJob = { ...job, syncToCalendar: nextVal };
    setJob(updatedJob);
    try {
      await DB.saveJob(updatedJob);
      if (googleAccessToken) await syncJobToGoogle(updatedJob, googleAccessToken, client?.name);
      await onRefresh();
    } catch (e: any) {
      console.error("Sync flip protocol error:", e);
      alert(`Sync update failed: ${e.message}`);
    }
  };

  const handleFieldChange = (field: keyof Job, value: any) => {
    if (!job) return;
    setJob({ ...job, [field]: value });
  };

  const handleDownloadPDF = async () => {
    if (!docRef.current || !job || !client) return;
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 100));
    try {
      const element = docRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Job_${job.id}.pdf`);
    } catch (err) { alert("Export failed."); } finally { setIsSaving(false); }
  };

  const finalizeInvoice = async () => {
    if (!job || !client || isSaving || !selectedInvoiceDate || !currentUser) return;
    setIsSaving(true);
    try {
      const terms = parseInt(client.paymentTermsDays as any) || 30;
      const newInvoice: Invoice = {
        id: generateInvoiceId(currentUser),
        jobId: job.id,
        date: selectedInvoiceDate,
        dueDate: calculateDueDate(selectedInvoiceDate, terms),
        status: InvoiceStatus.DRAFT,
        tenant_id: job.tenant_id
      };
      await DB.saveInvoice(newInvoice);
      await onRefresh(); 
      setInvoice(newInvoice);
      setShowInvoiceModal(false);
      setShowPreview('invoice');
    } catch (err) { alert("Failed to issue invoice."); } finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="p-20 text-center animate-pulse font-black uppercase text-[10px] tracking-widest text-slate-400">Syncing Engine...</div>;
  if (!job) return <div className="p-20 text-center">Project Not Found</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/jobs" className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all shadow-sm"><i className="fa-solid fa-arrow-left"></i></Link>
          <div>
            <h2 className="text-3xl font-black text-slate-900">{job.description}</h2>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Protocol ID: {job.id} — {client?.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowPreview('quote')} className="px-5 py-3 bg-white border border-slate-200 text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all">Quotation</button>
          {!invoice ? (
            <button onClick={() => setShowInvoiceModal(true)} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-emerald-700 transition-all">Issue Invoice</button>
          ) : (
            <button onClick={() => setShowPreview('invoice')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl">View Invoice</button>
          )}
          <button onClick={() => handleUpdateJob()} disabled={isSaving || isDeleting} className="px-5 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all min-w-[140px]">
            {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <span id="save-feedback">Save Changes</span>}
          </button>
          <button onClick={() => { if(window.confirm('Delete project?')) DB.deleteJob(job.id).then(() => navigate('/jobs')) }} disabled={isSaving || isDeleting} className="w-11 h-11 bg-rose-50 text-rose-500 border border-rose-100 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm">
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </header>

      {/* Invoice Modal Rebranding */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
             <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">Issue Invoice</h3>
             <div className="space-y-4">
               <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Invoice Date</label>
                  <input type="date" value={selectedInvoiceDate} onChange={e => setSelectedInvoiceDate(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
               </div>
               <div className="flex gap-3 pt-4">
                 <button onClick={() => setShowInvoiceModal(false)} className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase border border-slate-100">Cancel</button>
                 <button onClick={finalizeInvoice} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl">Confirm & Issue</button>
               </div>
             </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Project Heading</label>
                <input value={job.description} onChange={e => handleFieldChange('description', e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Location / Site</label>
                <input value={job.location} onChange={e => handleFieldChange('location', e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">PO Protocol</label>
                <input value={job.poNumber || ''} onChange={e => handleFieldChange('poNumber', e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. TPF-PO-0082" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Process Status</label>
                <select value={job.status} onChange={e => handleFieldChange('status', e.target.value)} className={`w-full px-6 py-4 border rounded-2xl font-black text-[11px] uppercase outline-none appearance-none ${STATUS_COLORS[job.status]}`}>
                  {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* SCHEDULING UI - PERMANENTLY VISIBLE */}
            <div className="pt-10 border-t border-slate-100 space-y-8">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><i className="fa-solid fa-calendar-days"></i></div>
                     <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Production Schedule</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Define work sessions and cloud sync</p>
                     </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={toggleSync}
                    className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase transition-all border shadow-lg ${!job.syncToCalendar ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700' : 'bg-white text-indigo-600 border-indigo-100 hover:bg-slate-50'}`}
                  >
                    {!job.syncToCalendar ? "DONT SHOW IN CALENDAR" : "SYNC ACTIVE"}
                  </button>
               </div>

               <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
                  <button 
                    type="button" 
                    onClick={() => handleFieldChange('schedulingType', SchedulingType.CONTINUOUS)}
                    className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${job.schedulingType === SchedulingType.CONTINUOUS ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}
                  >
                    Continuous
                  </button>
                  <button 
                    type="button" 
                    onClick={() => handleFieldChange('schedulingType', SchedulingType.SHIFT_BASED)}
                    className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${job.schedulingType === SchedulingType.SHIFT_BASED ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400'}`}
                  >
                    Shift-based
                  </button>
               </div>

               {job.schedulingType === SchedulingType.SHIFT_BASED ? (
                 <div className="space-y-4">
                    {shifts.map((s, idx) => (
                      <div key={s.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-slate-50 rounded-[28px] border border-slate-200 animate-in slide-in-from-top-2">
                         <div className="md:col-span-3 flex items-center justify-between border-b border-slate-200 pb-3">
                           <input className="bg-transparent border-none outline-none font-black text-indigo-600 uppercase text-xs w-full" value={s.title} onChange={e => {
                             const next = [...shifts]; next[idx].title = e.target.value; setShifts(next);
                           }} />
                           <button type="button" onClick={() => setShifts(shifts.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-500"><i className="fa-solid fa-trash-can text-xs"></i></button>
                         </div>
                         <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 px-1">Start Date</label>
                            <input type="date" value={s.startDate} onChange={e => { const next = [...shifts]; next[idx].startDate = e.target.value; setShifts(next); }} className="w-full bg-white px-4 py-3 rounded-xl text-xs font-bold outline-none border border-slate-200" />
                         </div>
                         <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 px-1">End Date</label>
                            <input type="date" value={s.endDate} onChange={e => { const next = [...shifts]; next[idx].endDate = e.target.value; setShifts(next); }} className="w-full bg-white px-4 py-3 rounded-xl text-xs font-bold outline-none border border-slate-200" />
                         </div>
                         <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer pt-4">
                               <input type="checkbox" checked={s.isFullDay} onChange={e => { const next = [...shifts]; next[idx].isFullDay = e.target.checked; setShifts(next); }} className="w-5 h-5 rounded accent-indigo-600" />
                               <span className="text-[10px] font-black text-slate-900 uppercase">Full Day</span>
                            </label>
                         </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => setShifts([...shifts, { id: generateId(), jobId: job.id, title: 'New Work Session', startDate: job.startDate, endDate: job.startDate, startTime: '09:00', endTime: '17:30', isFullDay: true, tenant_id: job.tenant_id }])} className="w-full py-5 border-2 border-dashed border-indigo-100 rounded-3xl text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:bg-indigo-50/30 transition-all">+ Add Work Session</button>
                 </div>
               ) : (
                 <div className="grid grid-cols-2 gap-8 animate-in fade-in duration-300">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase block px-1 tracking-widest">Start Date</label>
                       <input type="date" value={job.startDate} onChange={e => handleFieldChange('startDate', e.target.value)} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold shadow-sm outline-none" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase block px-1 tracking-widest">End Date</label>
                       <input type="date" value={job.endDate} onChange={e => handleFieldChange('endDate', e.target.value)} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold shadow-sm outline-none" />
                    </div>
                 </div>
               )}
            </div>
            
            <div className="pt-10 border-t border-slate-100">
               <div className="flex items-center justify-between mb-6">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Project Deliverables</label>
                  <button type="button" onClick={() => setItems([...items, { id: generateId(), jobId: job.id, description: '', qty: 1, unitPrice: 0, rechargeAmount: 0, actualCost: 0 }])} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">+ New Entry</button>
               </div>
               <div className="space-y-3">
                  {items.map((it, idx) => (
                    <div key={it.id} className="grid grid-cols-12 gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl items-center shadow-inner">
                       <input className="col-span-6 px-4 py-2 bg-white rounded-xl text-xs font-bold outline-none border border-slate-100 focus:border-indigo-200" value={it.description} onChange={e => {
                         const n = [...items]; n[idx].description = e.target.value; setItems(n);
                       }} />
                       <input type="number" className="col-span-2 px-1 py-2 bg-white rounded-xl text-xs font-black text-center outline-none border border-slate-100" value={it.qty} onChange={e => {
                         const n = [...items]; n[idx].qty = parseFloat(e.target.value) || 0; setItems(n);
                       }} />
                       <input type="number" className="col-span-3 px-1 py-2 bg-white rounded-xl text-xs font-black text-right outline-none border border-slate-100" value={it.unitPrice} onChange={e => {
                         const n = [...items]; n[idx].unitPrice = parseFloat(e.target.value) || 0; setItems(n);
                       }} />
                       <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="col-span-1 text-slate-200 hover:text-rose-500 flex justify-center"><i className="fa-solid fa-trash-can text-xs"></i></button>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
           <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5"><i className="fa-solid fa-vault text-7xl"></i></div>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest italic mb-2">Project Valuation</p>
              <h4 className="text-4xl font-black tracking-tighter mb-8">{formatCurrency(totalRecharge, currentUser)}</h4>
              <div className="space-y-3">
                 <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>Net Total</span>
                    <span>{formatCurrency(totalRecharge, currentUser)}</span>
                 </div>
                 {currentUser?.isVatRegistered && (
                   <div className="flex justify-between text-[11px] font-bold text-indigo-400 uppercase tracking-widest">
                      <span>{currentUser.taxName} ({currentUser.taxRate}%)</span>
                      <span>{formatCurrency(totalRecharge * (currentUser.taxRate / 100), currentUser)}</span>
                   </div>
                 )}
                 <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white">Gross Val</span>
                    <span className="text-xl font-black text-emerald-400">{formatCurrency(totalRecharge * (currentUser?.isVatRegistered ? (1 + (currentUser.taxRate / 100)) : 1), currentUser)}</span>
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-3 italic">
                <i className="fa-solid fa-address-card text-indigo-600"></i> Client Dossier
              </h4>
              <div className="space-y-6">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Corporate Identity</p>
                    <p className="font-black text-slate-900 text-lg">{client?.name}</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Billing Protocol</p>
                    <p className="text-xs font-bold text-slate-700">{client?.email}</p>
                 </div>
                 <Link to="/clients" className="block text-center py-3 bg-slate-50 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors shadow-sm">Update Records</Link>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
