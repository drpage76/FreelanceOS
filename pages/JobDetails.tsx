
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
    
    // Calculate final start/end dates based on shifts if applicable
    let startDate = job.startDate;
    let endDate = job.endDate;
    if (job.schedulingType === SchedulingType.SHIFT_BASED && shifts.length > 0) {
      const startDates = shifts.map(s => s.startDate).filter(Boolean).sort();
      const endDates = shifts.map(s => s.endDate).filter(Boolean).sort();
      if (startDates.length > 0) startDate = startDates[0]!;
      if (endDates.length > 0) endDate = endDates[endDates.length - 1]!;
    }

    const formEl = document.getElementById('job-full-edit-form') as HTMLFormElement;
    const formData = new FormData(formEl);
    
    const updatedJob: Job = {
      ...job,
      description: (formData.get('description') as string) || job.description,
      location: (formData.get('location') as string) || job.location,
      poNumber: (formData.get('poNumber') as string) || job.poNumber,
      status: (formData.get('status') as JobStatus) || job.status,
      totalRecharge: totalRecharge,
      shifts: shifts,
      startDate,
      endDate,
      syncToCalendar: job.syncToCalendar
    };

    try {
      await DB.saveJob(updatedJob);
      await DB.saveJobItems(job.id, items);
      if (googleAccessToken) await syncJobToGoogle(updatedJob, googleAccessToken, client?.name);
      setJob(updatedJob);
      await onRefresh();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const toggleSync = async () => {
    if (!job) return;
    const nextVal = !job.syncToCalendar;
    const updatedJob = { ...job, syncToCalendar: nextVal };
    setJob(updatedJob);
    // Persist immediately and trigger cloud sync protocol
    try {
      await DB.saveJob(updatedJob);
      if (googleAccessToken) await syncJobToGoogle(updatedJob, googleAccessToken, client?.name);
      await onRefresh();
    } catch (e) {
      console.error("Sync flip protocol error:", e);
    }
  };

  const handleDeleteJob = async () => {
    if (!job || !window.confirm("Are you sure you want to permanently delete this project? This cannot be undone.")) return;
    setIsDeleting(true);
    try {
      await DB.deleteJob(job.id);
      await onRefresh();
      navigate('/jobs');
    } catch (err) {
      alert("Failed to delete project.");
      setIsDeleting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!docRef.current || !job || !client) return;
    setIsSaving(true);
    
    await new Promise(r => setTimeout(r, 100));

    try {
      const element = docRef.current;
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        logging: false,
        width: element.offsetWidth,
        height: element.scrollHeight,
        windowHeight: element.scrollHeight,
        y: 0,
        scrollX: 0,
        scrollY: 0
      });
      
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const pdfWidth = 210;
      const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
      
      const pdf = new jsPDF({ 
        orientation: 'portrait', 
        unit: 'mm', 
        format: [pdfWidth, pdfHeight] 
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const docPrefix = showPreview === 'invoice' ? 'Invoice' : 'Quote';
      const docId = showPreview === 'invoice' ? (invoice?.id || job.id) : job.id;
      const finalFileName = `${docPrefix} ${docId} ${client.name}.pdf`;
      pdf.save(finalFileName);

      // Google Drive Background Sync
      if (googleAccessToken && currentUser?.businessName) {
        const pdfBlob = pdf.output('blob');
        const folderName = `${currentUser.businessName} Invoices`;
        await uploadToGoogleDrive(googleAccessToken, folderName, finalFileName, pdfBlob);
      }
    } catch (err) { 
      console.error(err);
      alert("Export failed."); 
    } finally { 
      setIsSaving(false); 
    }
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

  if (isLoading) return (
    <div className="flex-1 flex flex-col items-center justify-center p-20 gap-4">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Syncing Project Protocol...</p>
    </div>
  );

  if (!job) return (
    <div className="flex-1 flex flex-col items-center justify-center p-20">
      <p className="text-slate-400 font-bold uppercase tracking-widest">Project Not Found</p>
      <Link to="/jobs" className="mt-4 text-indigo-600 font-black uppercase text-xs">Back to Archive</Link>
    </div>
  );

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
          <button onClick={() => setShowPreview('quote')} className="px-5 py-3 bg-white border border-slate-200 text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all">Print Quotation</button>
          {!invoice ? (
            <button onClick={() => setShowInvoiceModal(true)} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-emerald-700 transition-all">Print Invoice</button>
          ) : (
            <button onClick={() => setShowPreview('invoice')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl">View Invoice</button>
          )}
          <button onClick={() => handleUpdateJob()} disabled={isSaving || isDeleting} className="px-5 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all">
            {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : 'Save Changes'}
          </button>
          <button onClick={handleDeleteJob} disabled={isSaving || isDeleting} className="w-11 h-11 bg-rose-50 text-rose-500 border border-rose-100 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm">
            {isDeleting ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-trash-can"></i>}
          </button>
        </div>
      </header>

      {showInvoiceModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl">
             <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">Invoice Protocol</h3>
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

      {showPreview && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
           <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl my-8 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center sticky top-0 z-50">
                 <span className="text-[10px] font-black uppercase text-indigo-600 px-4">Document Preview — {showPreview === 'invoice' ? invoice?.id : 'Quote Protocol'}</span>
                 <div className="flex gap-2">
                    <button onClick={handleDownloadPDF} disabled={isSaving} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2">
                      {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-download"></i>} Download
                    </button>
                    <button onClick={() => setShowPreview(null)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-slate-400 hover:text-rose-500 border border-slate-200"><i className="fa-solid fa-xmark"></i></button>
                 </div>
              </div>
              <div className="p-8 bg-slate-100 overflow-x-auto">
                <div ref={docRef} className="bg-white p-16 pb-32 border border-slate-100 min-h-[1120px] w-[800px] mx-auto text-slate-900 shadow-sm font-sans">
                   <div className="flex justify-between items-start mb-16">
                      <div>
                        {currentUser?.logoUrl ? <img src={currentUser.logoUrl} alt="Logo" className="h-28 mb-8 object-contain" /> : <div className="text-3xl font-black italic mb-8">Freelance<span className="text-indigo-600">OS</span></div>}
                        <h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-2">{showPreview === 'invoice' ? 'Invoice' : 'Quotation'}</h1>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                          {showPreview === 'invoice' ? `Reference: ${invoice?.id}` : `Ref: ${job.id}-Q`}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-black text-2xl mb-1">{currentUser?.businessName}</p>
                        <p className="text-slate-500 whitespace-pre-line leading-relaxed">{currentUser?.businessAddress}</p>
                        {currentUser?.vatNumber && <p className="text-[10px] font-black uppercase tracking-widest mt-4 text-slate-400">{currentUser.taxName}: {currentUser.vatNumber}</p>}
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-12 mb-16">
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-3">Client Identity</p>
                        <p className="font-black text-2xl mb-2">{client?.name}</p>
                        <p className="text-sm text-slate-500 whitespace-pre-line leading-relaxed">{client?.address}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-3">Project Details</p>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-800">Date Issued: {formatDate(showPreview === 'invoice' ? (invoice?.date || '') : (new Date().toISOString()))}</p>
                          {showPreview === 'invoice' && <p className="text-sm font-black text-indigo-600 mb-3">Due Date: {formatDate(invoice?.dueDate || '')}</p>}
                          
                          <div className="mt-4 pt-4 border-t border-slate-50 space-y-1">
                             <p className="text-sm font-black text-slate-900 leading-tight">Project: {job.description}</p>
                             <p className="text-[11px] font-bold text-slate-500 italic">Location: {job.location || 'TBD'}</p>
                             <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Period: {formatDate(job.startDate)} — {formatDate(job.endDate)}</p>
                             {job.poNumber && (
                               <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest mt-2 border-t border-indigo-50 pt-1 inline-block">Purchase Order: {job.poNumber}</p>
                             )}
                          </div>
                        </div>
                      </div>
                   </div>

                   <table className="w-full mb-16">
                      <thead>
                        <tr className="border-b-2 border-slate-900">
                          <th className="py-4 text-left text-[11px] font-black uppercase tracking-[0.2em]">Deliverable</th>
                          <th className="py-4 text-center text-[11px] font-black uppercase tracking-[0.2em]">Qty</th>
                          <th className="py-4 text-right text-[11px] font-black uppercase tracking-[0.2em]">Rate</th>
                          <th className="py-4 text-right text-[11px] font-black uppercase tracking-[0.2em]">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map(it => (
                          <tr key={it.id}>
                            <td className="py-6 font-bold text-slate-800 text-base">{it.description}</td>
                            <td className="py-6 text-center text-slate-600 font-black text-sm">{it.qty}</td>
                            <td className="py-6 text-right text-slate-600 font-black text-sm">{formatCurrency(it.unitPrice, currentUser)}</td>
                            <td className="py-6 text-right font-black text-slate-900 text-base">{formatCurrency(it.qty * it.unitPrice, currentUser)}</td>
                          </tr>
                        ))}
                      </tbody>
                   </table>

                   <div className="flex justify-end pt-12 border-t-2 border-slate-900 mb-20">
                      <div className="w-72 space-y-5">
                        <div className="flex justify-between items-center text-sm font-black uppercase tracking-widest text-slate-400">
                           <span>Subtotal</span>
                           <span className="text-slate-900">{formatCurrency(totalRecharge, currentUser)}</span>
                        </div>
                        {currentUser?.isVatRegistered && (
                          <div className="flex justify-between items-center text-sm font-black uppercase tracking-widest text-slate-400">
                             <span>{currentUser.taxName} ({currentUser.taxRate}%)</span>
                             <span className="text-slate-900">{formatCurrency(totalRecharge * (currentUser.taxRate / 100), currentUser)}</span>
                          </div>
                        )}
                        <div className="pt-6 border-t border-slate-100 flex justify-between items-center">
                           <span className="text-xs font-black uppercase tracking-[0.4em]">Total Payable</span>
                           <span className="text-4xl font-black text-indigo-600 tracking-tighter">
                             {formatCurrency(totalRecharge * (currentUser?.isVatRegistered ? (1 + (currentUser.taxRate / 100)) : 1), currentUser)}
                           </span>
                        </div>
                      </div>
                   </div>

                   <div className="mt-20 pt-16 border-t border-slate-100 grid grid-cols-2 gap-12">
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-4">Remittance & Banking</p>
                        <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 shadow-inner font-mono text-[12px] leading-relaxed text-slate-700">
                          {currentUser?.accountName && <p className="font-black text-slate-900 mb-1">{currentUser.accountName}</p>}
                          {currentUser?.accountNumber && <p>ACC: {currentUser.accountNumber}</p>}
                          {currentUser?.sortCodeOrIBAN && <p>SORT/IBAN: {currentUser.sortCodeOrIBAN}</p>}
                          {!currentUser?.accountName && <p className="text-slate-400 italic">No banking details configured.</p>}
                        </div>
                      </div>
                      <div className="flex flex-col justify-end text-right">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-4">Verification</p>
                        <p className="text-[11px] text-slate-400 italic leading-relaxed">
                          This document is generated by FreelanceOS. Please use the reference ID {showPreview === 'invoice' ? invoice?.id : job.id} for all related correspondence.
                        </p>
                      </div>
                   </div>
                </div>
              </div>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <form id="job-full-edit-form" className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Project Heading</label>
                <input name="description" defaultValue={job.description} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Location / Site</label>
                <input name="location" defaultValue={job.location} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">PO Protocol</label>
                <input name="poNumber" defaultValue={job.poNumber} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" placeholder="None" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Process Status</label>
                <select name="status" defaultValue={job.status} className={`w-full px-6 py-4 border rounded-2xl font-black text-[11px] uppercase outline-none appearance-none ${STATUS_COLORS[job.status]}`}>
                  {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2 flex flex-col justify-end">
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <i className="fa-brands fa-google text-indigo-600"></i>
                       <span className="text-[10px] font-black text-slate-900 uppercase">Cloud Calendar Sync</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={toggleSync}
                      className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all border ${job.syncToCalendar ? 'bg-white text-indigo-600 border-indigo-100 hover:bg-slate-100' : 'bg-rose-600 text-white border-rose-600 shadow-md'}`}
                    >
                      {job.syncToCalendar ? 'CALENDAR ACTIVE' : "DON'T SHOW IN CALENDAR"}
                    </button>
                 </div>
              </div>
            </div>

            {/* Permanent Scheduling UI */}
            <div className="pt-8 border-t border-slate-50 space-y-6">
               <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Production Schedule</h4>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button 
                      type="button" 
                      onClick={() => setJob({...job, schedulingType: SchedulingType.CONTINUOUS})}
                      className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${job.schedulingType === SchedulingType.CONTINUOUS ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      Continuous
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setJob({...job, schedulingType: SchedulingType.SHIFT_BASED})}
                      className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${job.schedulingType === SchedulingType.SHIFT_BASED ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                    >
                      Shift-based
                    </button>
                  </div>
               </div>

               {job.schedulingType === SchedulingType.SHIFT_BASED ? (
                 <div className="space-y-4">
                    {shifts.map((s, idx) => (
                      <div key={s.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                         <div className="md:col-span-3 flex items-center justify-between">
                           <input className="bg-transparent border-none outline-none font-black text-indigo-600 uppercase text-xs w-full" value={s.title} onChange={e => {
                             const next = [...shifts]; next[idx].title = e.target.value; setShifts(next);
                           }} />
                           <button type="button" onClick={() => setShifts(shifts.filter((_, i) => i !== idx))} className="text-rose-400 hover:text-rose-600"><i className="fa-solid fa-trash-can text-xs"></i></button>
                         </div>
                         <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Start</label>
                            <input type="date" value={s.startDate} onChange={e => { const next = [...shifts]; next[idx].startDate = e.target.value; setShifts(next); }} className="w-full bg-white px-3 py-2 rounded-lg text-xs font-bold outline-none border border-slate-100" />
                         </div>
                         <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">End</label>
                            <input type="date" value={s.endDate} onChange={e => { const next = [...shifts]; next[idx].endDate = e.target.value; setShifts(next); }} className="w-full bg-white px-3 py-2 rounded-lg text-xs font-bold outline-none border border-slate-100" />
                         </div>
                         <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer pt-4">
                               <input type="checkbox" checked={s.isFullDay} onChange={e => { const next = [...shifts]; next[idx].isFullDay = e.target.checked; setShifts(next); }} className="w-4 h-4 rounded accent-indigo-600" />
                               <span className="text-[9px] font-black text-slate-400 uppercase">Full Day</span>
                            </label>
                         </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => setShifts([...shifts, { id: generateId(), jobId: job.id, title: 'New Shift', startDate: job.startDate, endDate: job.startDate, startTime: '09:00', endTime: '17:30', isFullDay: true, tenant_id: job.tenant_id }])} className="w-full py-4 border-2 border-dashed border-indigo-100 rounded-2xl text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:bg-indigo-50/30 transition-all">+ Add Work Session</button>
                 </div>
               ) : (
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Start Date</label>
                       <input type="date" name="startDate" defaultValue={job.startDate} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase block px-1">End Date</label>
                       <input type="date" name="endDate" defaultValue={job.endDate} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
                    </div>
                 </div>
               )}
            </div>
            
            <div className="pt-8 border-t border-slate-50">
               <div className="flex items-center justify-between mb-6">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Project Deliverables</label>
                  <button type="button" onClick={() => setItems([...items, { id: generateId(), jobId: job.id, description: '', qty: 1, unitPrice: 0, rechargeAmount: 0, actualCost: 0 }])} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">+ New Entry</button>
               </div>
               <div className="space-y-3">
                  {items.map((it, idx) => (
                    <div key={it.id} className="grid grid-cols-12 gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl items-center shadow-inner">
                       <input className="col-span-6 px-4 py-2 bg-white rounded-xl text-xs font-bold outline-none border border-slate-100" value={it.description} onChange={e => {
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
          </form>
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
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-3">
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
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Postal Reference</p>
                    <p className="text-xs font-medium text-slate-500 leading-relaxed italic">{client?.address}</p>
                 </div>
                 <Link to="/clients" className="block text-center py-3 bg-slate-50 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors shadow-sm">Edit Client Network</Link>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
