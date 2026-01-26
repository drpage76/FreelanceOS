
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';

const { useParams, useNavigate, Link } = ReactRouterDOM;

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

import { Job, JobItem, JobStatus, Client, Invoice, InvoiceStatus, JobShift, SchedulingType, Tenant } from '../types';
import { DB, generateId } from '../services/db';
import { formatCurrency, formatDate, calculateDueDate, generateInvoiceId } from '../utils';
import { STATUS_COLORS } from '../constants';
import { syncJobToGoogle } from '../services/googleCalendar';

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
  const [currentUser, setCurrentUser] = useState<Tenant | null>(null);
  
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showQuotePreview, setShowQuotePreview] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [selectedInvoiceDate, setSelectedInvoiceDate] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  
  const docRef = useRef<HTMLDivElement>(null);

  const handleShiftChange = (index: number, field: keyof JobShift, value: any) => {
    const next = [...shifts];
    (next[index] as any)[field] = value;
    setShifts(next);
  };

  const fetchData = async () => {
    if (!id) return;
    try {
      const user = await DB.getCurrentUser();
      setCurrentUser(user);
      
      const allJobs = await DB.getJobs();
      const foundJob = allJobs.find(j => j.id === id);
      
      if (foundJob) {
        setJob(foundJob);
        if (!selectedInvoiceDate) setSelectedInvoiceDate(foundJob.endDate);
        
        if (foundJob.shifts && foundJob.shifts.length > 0) {
          setShifts(foundJob.shifts);
        } else {
          const jobShifts = await DB.getShifts(id);
          setShifts(jobShifts || []);
        }

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
      console.error("Fetch Details Error:", err);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const totalRecharge = useMemo(() => items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0), [items]);

  const handleUpdateJob = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!job || isSaving) return;
    setIsSaving(true);
    
    const formEl = document.getElementById('job-full-edit-form') as HTMLFormElement;
    const formData = new FormData(formEl);

    let startDate = (formData.get('startDate') as string) || job.startDate;
    let endDate = (formData.get('endDate') as string) || job.endDate;

    if (job.schedulingType === SchedulingType.SHIFT_BASED && shifts.length > 0) {
      const sortedStarts = shifts.map(s => s.startDate).filter(Boolean).sort();
      const sortedEnds = shifts.map(s => s.endDate).filter(Boolean).sort();
      if (sortedStarts.length > 0) startDate = sortedStarts[0];
      if (sortedEnds.length > 0) endDate = sortedEnds[sortedEnds.length - 1];
    }

    const updatedJob: Job = {
      ...job,
      description: (formData.get('description') as string) || job.description,
      location: (formData.get('location') as string) || job.location,
      poNumber: (formData.get('poNumber') as string) || job.poNumber,
      status: (formData.get('status') as JobStatus) || job.status,
      startDate,
      endDate,
      totalRecharge: totalRecharge,
      shifts: shifts 
    };

    try {
      await DB.saveJob(updatedJob);
      const finalItems = items.map(it => ({ 
        ...it, 
        jobId: job.id, 
        rechargeAmount: (parseFloat(it.qty as any) || 0) * (parseFloat(it.unitPrice as any) || 0) 
      }));
      await DB.saveJobItems(job.id, finalItems);
      
      if (googleAccessToken) {
        await syncJobToGoogle(updatedJob, googleAccessToken, client?.name);
      }

      setJob(updatedJob);
      await onRefresh();
    } catch (err: any) {
      alert(`Sync Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async (filename: string) => {
    if (!docRef.current) return;
    setIsSaving(true);
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(docRef.current!, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(filename);
      } catch (err) { alert("PDF Export failed."); } finally { setIsSaving(false); }
    }, 150);
  };

  const handleMarkAsPaidSubmit = async () => {
    if (!invoice || !job) return;
    setIsSaving(true);
    try {
      const updatedInvoice: Invoice = { ...invoice, status: InvoiceStatus.PAID, datePaid: paymentDate };
      await DB.saveInvoice(updatedInvoice);
      const updatedJob: Job = { ...job, status: JobStatus.COMPLETED };
      await DB.saveJob(updatedJob);
      setInvoice(updatedInvoice);
      setJob(updatedJob);
      await onRefresh();
      setShowPaymentModal(false);
    } catch (err) { alert("Error marking as paid."); } finally { setIsSaving(false); }
  };

  const finalizeInvoice = async () => {
    if (!job || !client || isSaving || !selectedInvoiceDate) return;
    setIsSaving(true);
    try {
      const invoices = await DB.getInvoices();
      const terms = parseInt(client.paymentTermsDays as any) || 30;
      const newInvoice: Invoice = {
        id: generateInvoiceId(invoices.length + 1),
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
      setShowInvoicePreview(true);
    } catch (err) { alert("Invoice failed."); }
    finally { setIsSaving(false); }
  };

  const DocumentRender = ({ type, docId, date, dueDate, validUntil }: { type: 'QUOTATION' | 'INVOICE', docId: string, date: string, dueDate?: string, validUntil?: string }) => (
    <div ref={docRef} className="bg-white p-12 border border-slate-100 min-h-[1000px] shadow-sm text-slate-900 font-sans">
      <div className="flex justify-between items-start mb-20">
        <div>
          {currentUser?.logoUrl ? (
            <img src={currentUser.logoUrl} alt="Logo" className="h-32 mb-6 object-contain" />
          ) : (
            <div className="flex items-center gap-2 mb-6">
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><i className="fa-solid fa-bolt text-xl"></i></div>
              <span className="text-2xl font-black tracking-tighter">Freelance<span className="text-indigo-400">OS</span></span>
            </div>
          )}
          <h1 className="text-5xl font-black uppercase tracking-tight">{type}</h1>
          <p className="text-slate-400 font-bold uppercase text-xs mt-2 tracking-widest">Reference: {docId}</p>
        </div>
        <div className="text-right">
          <p className="font-black text-xl">{currentUser?.businessName}</p>
          <p className="text-sm text-slate-500 whitespace-pre-line leading-relaxed mt-2">{currentUser?.businessAddress}</p>
          {currentUser?.vatNumber && <p className="text-[10px] font-black uppercase text-slate-400 mt-2">VAT: {currentUser.vatNumber}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-10 mb-20">
        <div>
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">{type === 'QUOTATION' ? 'Prepared For' : 'Attention To'}</p>
          <p className="font-black text-xl">{client?.name}</p>
          <p className="text-sm text-slate-500 whitespace-pre-line leading-relaxed mt-2">{client?.address}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Schedule & Details</p>
          <p className="text-sm font-bold text-slate-700">{type === 'QUOTATION' ? 'Issue Date:' : 'Invoice Date:'} {formatDate(date)}</p>
          {dueDate && <p className="text-sm font-black text-indigo-600 mt-1">Payment Due: {formatDate(dueDate)}</p>}
          {validUntil && <p className="text-sm font-black text-indigo-600 mt-1">Quote Valid Until: {formatDate(validUntil)}</p>}
          <div className="mt-4 pt-4 border-t border-slate-50">
            <p className="text-[9px] font-black text-slate-300 uppercase mb-1">Project Identifier</p>
            <p className="text-sm font-bold text-slate-700">{job?.description}</p>
            <p className="text-xs font-medium text-slate-400">{job?.location}</p>
          </div>
        </div>
      </div>

      <table className="w-full mb-12">
        <thead>
          <tr className="border-b-2 border-slate-900">
            <th className="py-4 text-left text-[10px] font-black uppercase tracking-widest">Deliverable / Description</th>
            <th className="py-4 text-center text-[10px] font-black uppercase tracking-widest">Qty</th>
            <th className="py-4 text-right text-[10px] font-black uppercase tracking-widest">Unit Price</th>
            <th className="py-4 text-right text-[10px] font-black uppercase tracking-widest">Net Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(it => (
            <tr key={it.id}>
              <td className="py-5 font-bold text-slate-700 text-sm">{it.description}</td>
              <td className="py-5 text-center text-slate-600 font-black text-xs">{it.qty}</td>
              <td className="py-5 text-right text-slate-600 font-black text-xs">{formatCurrency(it.unitPrice)}</td>
              <td className="py-5 text-right font-black text-slate-900 text-sm">{formatCurrency(it.qty * it.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end pt-10 border-t-2 border-slate-900">
        <div className="w-64 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal (Net)</span>
            <span className="text-xl font-bold text-slate-700">{formatCurrency(totalRecharge)}</span>
          </div>
          {currentUser?.isVatRegistered && (
            <div className="flex justify-between items-center pt-2 border-t border-slate-50">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">VAT (20%)</span>
              <span className="text-xl font-bold text-slate-700">{formatCurrency(totalRecharge * 0.2)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-4 border-t-2 border-slate-900">
            <span className="text-xs font-black uppercase tracking-widest">Total Amount</span>
            <span className="text-3xl font-black text-indigo-600">{formatCurrency(totalRecharge * (currentUser?.isVatRegistered ? 1.2 : 1))}</span>
          </div>
        </div>
      </div>

      <div className="mt-40 pt-10 border-t border-slate-100 grid grid-cols-2 gap-10">
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Settlement & Remittance</p>
          <div className="bg-slate-50 p-6 rounded-2xl font-mono text-[11px] text-slate-700 leading-relaxed border border-slate-100 shadow-inner">
            {currentUser?.bankDetails || 'Provide bank details in your OS Settings.'}
          </div>
        </div>
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Terms & Provisions</p>
          <p className="text-[11px] text-slate-500 leading-relaxed font-medium italic">
            {type === 'QUOTATION' 
              ? `This proposal is based on the requirements discussed and remains valid until ${formatDate(validUntil || '')}. Full settlement is required within ${client?.paymentTermsDays || 30} days of project completion.`
              : `Settlement of this invoice is required by ${formatDate(dueDate || '')}. Please ensure the reference ${docId} is included with your transfer. Thank you for your business.`}
          </p>
        </div>
      </div>
    </div>
  );

  if (!job) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      {/* Modals for Invoice generation and Payment recording */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
           <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200 animate-in zoom-in-95">
              <h3 className="text-xl font-black text-slate-900 mb-2">Issue Project Invoice</h3>
              <p className="text-sm text-slate-500 font-medium mb-6">Terms for {client?.name}: {client?.paymentTermsDays || 30} days.</p>
              <input type="date" value={selectedInvoiceDate} onChange={(e) => setSelectedInvoiceDate(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none mb-6" />
              <div className="flex gap-3">
                <button onClick={() => setShowInvoiceModal(false)} className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase text-[10px]">Cancel</button>
                <button onClick={finalizeInvoice} disabled={isSaving} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg flex items-center justify-center gap-2">
                  {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-check"></i>} Generate
                </button>
              </div>
           </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && invoice && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
           <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200 animate-in zoom-in-95">
              <h3 className="text-xl font-black text-slate-900 mb-2">Record Settlement</h3>
              <p className="text-sm text-slate-500 font-medium mb-6">Confirm date funds were received for Ref: {invoice.id}</p>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none mb-6" />
              <div className="flex gap-3">
                <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase text-[10px]">Cancel</button>
                <button onClick={handleMarkAsPaidSubmit} disabled={isSaving} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg">Confirm Paid</button>
              </div>
           </div>
        </div>
      )}

      {/* Quote Preview Modal */}
      {showQuotePreview && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto">
           <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl border border-slate-200 animate-in zoom-in-95 my-auto overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Professional Quotation</h3>
                 <div className="flex gap-2">
                    <button onClick={() => handleDownloadPDF(`Quotation_${job.id}.pdf`)} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg flex items-center gap-2"><i className="fa-solid fa-download"></i> PDF</button>
                    <button onClick={() => setShowQuotePreview(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-500"><i className="fa-solid fa-xmark"></i></button>
                 </div>
              </div>
              <div className="p-10 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <DocumentRender type="QUOTATION" docId={job.id} date={job.startDate} validUntil={job.endDate} />
              </div>
           </div>
        </div>
      )}

      {/* Invoice Preview Modal */}
      {showInvoicePreview && invoice && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto">
           <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl border border-slate-200 animate-in zoom-in-95 my-auto overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Professional Invoice</h3>
                 <div className="flex gap-2">
                    <button onClick={() => handleDownloadPDF(`Invoice_${invoice.id}.pdf`)} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase shadow-lg flex items-center gap-2"><i className="fa-solid fa-download"></i> PDF</button>
                    <button onClick={() => setShowInvoicePreview(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-500"><i className="fa-solid fa-xmark"></i></button>
                 </div>
              </div>
              <div className="p-10 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <DocumentRender type="INVOICE" docId={invoice.id} date={invoice.date} dueDate={invoice.dueDate} />
              </div>
           </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/jobs" className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 shadow-sm"><i className="fa-solid fa-arrow-left"></i></Link>
          <div><h2 className="text-2xl font-black text-slate-900 leading-none">Job Workspace</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Ref: {job.id}</p></div>
        </div>
        <div className="flex flex-wrap gap-2 justify-center md:justify-end">
          <button onClick={() => setShowQuotePreview(true)} className="px-6 py-3 bg-white text-indigo-600 border border-indigo-100 rounded-xl font-black text-[10px] uppercase hover:bg-indigo-50 transition-all flex items-center gap-2">
             <i className="fa-solid fa-file-signature"></i> Print Quotation
          </button>
          
          {invoice ? (
            <>
              <button onClick={() => setShowInvoicePreview(true)} className="px-6 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl font-black text-[10px] uppercase hover:bg-slate-50 transition-all flex items-center gap-2">
                 <i className="fa-solid fa-file-invoice"></i> View Invoice
              </button>
              {invoice.status !== InvoiceStatus.PAID && (
                <button onClick={() => setShowPaymentModal(true)} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-700">Record Payment</button>
              )}
            </>
          ) : (
            <button onClick={() => { setSelectedInvoiceDate(job.endDate); setShowInvoiceModal(true); }} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-black">Final Invoice</button>
          )}

          {invoice?.status === InvoiceStatus.PAID ? (
             <span className="px-6 py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-black text-[10px] uppercase flex items-center gap-2"><i className="fa-solid fa-check-double"></i> Fully Settled</span>
          ) : (
            <button onClick={() => handleUpdateJob()} disabled={isSaving} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg flex items-center justify-center gap-2">
              {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>} Sync Changes
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <form id="job-full-edit-form" onSubmit={handleUpdateJob} className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block px-1">Project Description</label>
                <input name="description" defaultValue={job.description} required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-lg outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block px-1">Pipeline Status</label>
                <select name="status" defaultValue={job.status} className={`w-full px-6 py-4 border rounded-2xl font-black text-[11px] uppercase outline-none appearance-none ${STATUS_COLORS[job.status]}`}>
                  {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block px-1">PO Number</label>
                <input name="poNumber" defaultValue={job.poNumber} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block px-1">Venue / Location</label>
                <input name="location" defaultValue={job.location} required className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none" />
              </div>

              <div className="md:col-span-2 p-6 bg-slate-50 rounded-[32px] border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-black text-slate-900 text-sm">Production Schedule</h4>
                  <div className="flex gap-2 bg-white p-1 rounded-xl border border-slate-100">
                    <button type="button" onClick={() => setJob({...job, schedulingType: SchedulingType.CONTINUOUS})} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${job.schedulingType === SchedulingType.CONTINUOUS ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-600'}`}>Continuous</button>
                    <button type="button" onClick={() => setJob({...job, schedulingType: SchedulingType.SHIFT_BASED})} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${job.schedulingType === SchedulingType.SHIFT_BASED ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-indigo-600'}`}>Shift-Based</button>
                  </div>
                </div>

                {job.schedulingType === SchedulingType.SHIFT_BASED ? (
                  <div className="space-y-4">
                    {shifts.map((s, idx) => (
                      <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <input className="px-3 py-2 bg-slate-50 rounded-lg text-xs font-black border-none w-full mb-3 outline-none" placeholder="Shift Label" value={s.title} onChange={e => handleShiftChange(idx, 'title', e.target.value)} />
                        <div className="grid grid-cols-2 gap-2">
                           <input type="date" className="px-2 py-2 bg-slate-50 rounded-lg text-[10px] font-bold border-none outline-none" value={s.startDate} onChange={e => handleShiftChange(idx, 'startDate', e.target.value)} />
                           <input type="date" className="px-2 py-2 bg-slate-50 rounded-lg text-[10px] font-bold border-none outline-none" value={s.endDate} onChange={e => handleShiftChange(idx, 'endDate', e.target.value)} />
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => setShifts([...shifts, { id: generateId(), jobId: job.id, title: 'New Shift', startDate: job.startDate, endDate: job.endDate, startTime: '09:00', endTime: '17:00', isFullDay: true, tenant_id: job.tenant_id }])} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest">+ Add Shift</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <input name="startDate" type="date" defaultValue={job.startDate} className="px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold outline-none" />
                    <input name="endDate" type="date" defaultValue={job.endDate} className="px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold outline-none" />
                  </div>
                )}
              </div>
            </div>
          </form>

          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
             <div className="flex items-center justify-between"><h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><i className="fa-solid fa-list-check text-indigo-600"></i> Deliverables</h3>
             <button type="button" onClick={() => setItems([...items, { id: generateId(), jobId: job.id, description: 'New Deliverable', qty: 1, unitPrice: 0, rechargeAmount: 0, actualCost: 0 }])} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[9px] uppercase border border-indigo-100">+ Add Entry</button></div>
             <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-12 gap-3 p-3 rounded-2xl border items-center bg-slate-50/50 border-slate-100 group transition-all hover:bg-white hover:shadow-lg">
                     <input className="col-span-7 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={item.description} onChange={(e) => {
                       const n = [...items]; n[idx].description = e.target.value; setItems(n);
                     }} />
                     <input type="number" className="col-span-2 px-2 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-center outline-none" value={item.qty} onChange={(e) => {
                       const n = [...items]; n[idx].qty = parseFloat(e.target.value) || 0; setItems(n);
                     }} />
                     <input type="number" className="col-span-2 px-3 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-right outline-none" value={item.unitPrice} onChange={(e) => {
                       const n = [...items]; n[idx].unitPrice = parseFloat(e.target.value) || 0; setItems(n);
                     }} />
                     <button onClick={async () => {
                        if (window.confirm("Delete row?")) {
                          if (item.id) await DB.deleteJobItem(item.id);
                          setItems(items.filter((_, i) => i !== idx));
                        }
                     }} className="col-span-1 text-slate-200 hover:text-rose-500 flex justify-center"><i className="fa-solid fa-trash-can text-xs"></i></button>
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 p-8 rounded-[40px] text-white shadow-2xl sticky top-6">
             <div className="flex items-center justify-between mb-2">
               <p className="text-slate-500 text-[8px] font-black uppercase tracking-[0.2em]">Project Valuation</p>
               <span className={`px-3 py-0.5 rounded-lg text-[7px] font-black uppercase border ${STATUS_COLORS[job.status]}`}>{job.status}</span>
             </div>
             <p className="text-5xl font-black mb-8">{formatCurrency(totalRecharge)}</p>
             <div className="space-y-4 pt-6 border-t border-white/10">
                <div className="flex justify-between items-center"><span className="text-slate-500 font-black text-[9px] uppercase">Client</span><span className="text-indigo-400 font-black text-xs">{client?.name || 'Unassigned'}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500 font-black text-[9px] uppercase">Location</span><span className="text-slate-300 font-black text-xs">{job.location}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500 font-black text-[9px] uppercase">Invoiced</span><span className={`font-black text-xs ${invoice ? 'text-emerald-400' : 'text-slate-600'}`}>{invoice ? `Yes (${invoice.id})` : 'No'}</span></div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
