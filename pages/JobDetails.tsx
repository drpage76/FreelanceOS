
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Job, JobItem, JobStatus, Client, Invoice, InvoiceStatus, JobShift, Tenant, SchedulingType } from '../types';
import { DB, generateId } from '../services/db';
import { formatCurrency, formatDate, calculateDueDate, generateInvoiceId } from '../utils';
import { STATUS_COLORS } from '../constants';
import { syncJobToGoogle, deleteJobFromGoogle } from '../services/googleCalendar';

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
      await DB.saveJob(updatedJob);
      await DB.saveJobItems(job.id, items);
      if (googleAccessToken) await syncJobToGoogle(updatedJob, googleAccessToken, client?.name);
      setJob(updatedJob);
      await onRefresh();
    } catch (err: any) { 
      alert(`Save Error: ${err.message}`); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleDeleteJob = async () => {
    if (!job || !window.confirm('Are you sure you want to delete this project and clear all associated calendar events?')) return;
    
    setIsDeleting(true);
    try {
      // 1. Clear Google Calendar first
      if (googleAccessToken) {
        await deleteJobFromGoogle(job.id, googleAccessToken);
      }
      
      // 2. Delete from DB
      await DB.deleteJob(job.id);
      
      // 3. Refresh and Exit
      onRefresh();
      navigate('/jobs');
    } catch (err) {
      alert("System failed to complete deletion protocol.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!docRef.current || !job || !client) return;
    setIsSaving(true);
    try {
      const element = docRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(imgData, 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
      pdf.save(`${showPreview === 'invoice' ? 'Invoice' : 'Quotation'}_${id}.pdf`);
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

  if (isLoading) return <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Syncing Engine...</div>;
  if (!job) return null;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-20 px-1 md:px-4">
      {/* Document Preview Modal */}
      {showPreview && client && (
        <div className="fixed inset-0 z-[300] flex flex-col bg-slate-900/95 backdrop-blur-xl p-4 md:p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto w-full flex justify-between items-center mb-6">
            <h3 className="text-white font-black uppercase tracking-widest text-xs">{showPreview === 'invoice' ? 'Invoice View' : 'Quotation Protocol'}</h3>
            <div className="flex gap-4">
              <button onClick={handleDownloadPDF} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg">Download PDF</button>
              <button onClick={() => setShowPreview(null)} className="w-10 h-10 bg-white/10 text-white rounded-xl flex items-center justify-center hover:bg-white/20"><i className="fa-solid fa-xmark"></i></button>
            </div>
          </div>
          <div className="max-w-4xl mx-auto w-full bg-white p-8 md:p-16 rounded-[40px] shadow-2xl overflow-x-auto">
            <div ref={docRef} className="w-[700px] mx-auto text-slate-900 bg-white p-4">
               {/* Header Section */}
               <div className="flex justify-between mb-12">
                  <div>
                    {currentUser?.logoUrl ? <img src={currentUser.logoUrl} className="h-20 mb-4 object-contain" /> : <div className="text-2xl font-black mb-4">FreelanceOS</div>}
                    <h2 className="text-4xl font-black uppercase">{showPreview === 'invoice' ? 'Invoice' : 'Quotation'}</h2>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">Reference: {showPreview === 'invoice' ? invoice?.id : 'QT-'+job.id}</p>
                    {job.poNumber && (
                      <p className="text-[10px] font-black text-indigo-600 mt-2 border-t border-indigo-50 pt-1 uppercase">PO Reference: {job.poNumber}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-black">{currentUser?.businessName}</p>
                    <p className="text-[10px] text-slate-400 whitespace-pre-line leading-relaxed">{currentUser?.businessAddress}</p>
                  </div>
               </div>

               {/* Recipient and Dates */}
               <div className="grid grid-cols-2 gap-8 mb-12">
                  <div>
                    <p className="text-[9px] font-black text-slate-300 uppercase mb-2">Recipient</p>
                    <p className="font-black text-lg">{client.name}</p>
                    <p className="text-[10px] text-slate-500 whitespace-pre-line leading-relaxed">{client.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-300 uppercase mb-2">Timeline & Reference</p>
                    <p className="text-[11px] font-bold">Document Date: {formatDate(showPreview === 'invoice' ? invoice?.date || '' : job.startDate)}</p>
                    {showPreview === 'invoice' && <p className="text-[11px] font-black text-indigo-600">Payment Due: {formatDate(invoice?.dueDate || '')}</p>}
                    <div className="mt-4 pt-4 border-t border-slate-50">
                       <p className="text-[10px] font-black text-slate-400 uppercase">Production Period</p>
                       <p className="text-xs font-bold text-slate-900">{formatDate(job.startDate)} — {formatDate(job.endDate)}</p>
                    </div>
                    <p className="text-[11px] font-bold mt-4 italic text-slate-700">{job.description}</p>
                  </div>
               </div>

               {/* Line Items */}
               <table className="w-full mb-12">
                  <thead className="border-b-2 border-slate-900">
                    <tr className="text-[10px] font-black uppercase">
                      <th className="py-3 text-left">Description</th>
                      <th className="py-3 text-center">Qty</th>
                      <th className="py-3 text-right">Price</th>
                      <th className="py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(it => (
                      <tr key={it.id}>
                        <td className="py-4 text-xs font-bold">{it.description}</td>
                        <td className="py-4 text-center text-xs">{it.qty}</td>
                        <td className="py-4 text-right text-xs">{formatCurrency(it.unitPrice, currentUser)}</td>
                        <td className="py-4 text-right text-xs font-black">{formatCurrency(it.qty * it.unitPrice, currentUser)}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>

               {/* Totals */}
               <div className="flex justify-end border-t-2 border-slate-900 pt-6">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-xs"><span>Net Amount</span><span className="font-bold">{formatCurrency(totalRecharge, currentUser)}</span></div>
                    {currentUser?.isVatRegistered && <div className="flex justify-between text-xs"><span>{currentUser.taxName} ({currentUser.taxRate}%)</span><span className="font-bold">{formatCurrency(totalRecharge * (currentUser.taxRate/100), currentUser)}</span></div>}
                    <div className="flex justify-between text-lg font-black border-t pt-2"><span>Gross Total</span><span className="text-indigo-600">{formatCurrency(totalRecharge * (currentUser?.isVatRegistered ? (1 + (currentUser.taxRate/100)) : 1), currentUser)}</span></div>
                  </div>
               </div>

               {/* Footer / Remittance */}
               <div className="mt-20 pt-10 border-t border-slate-100 grid grid-cols-2 gap-10">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Remittance Protocols</p>
                    <div className="bg-slate-50 p-6 rounded-2xl font-mono text-[10px] text-slate-700 border border-slate-100 shadow-inner">
                      {currentUser?.accountName && <p className="font-black mb-1">{currentUser.accountName}</p>}
                      {currentUser?.accountNumber && <p>Acc: {currentUser.accountNumber}</p>}
                      {currentUser?.sortCodeOrIBAN && <p>Sort/IBAN: {currentUser.sortCodeOrIBAN}</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Compliance</p>
                    <p className="text-[10px] text-slate-500 italic leading-relaxed">System-generated professional documentation for {currentUser?.businessName}. Terms as per master service agreement.</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/jobs" className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm"><i className="fa-solid fa-arrow-left"></i></Link>
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 truncate">{job.description}</h2>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Protocol {job.id}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowPreview('quote')} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase shadow-sm">Quotation</button>
          {!invoice ? (
            <button onClick={() => setShowInvoiceModal(true)} className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg">Issue Invoice</button>
          ) : (
            <button onClick={() => setShowPreview('invoice')} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg">View Invoice</button>
          )}
          <button onClick={() => handleUpdateJob()} disabled={isSaving} className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase shadow-xl hover:bg-black transition-all">
            {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : 'Save Changes'}
          </button>
          <button onClick={handleDeleteJob} disabled={isDeleting} className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl border border-rose-100 flex items-center justify-center transition-all hover:bg-rose-500 hover:text-white">
            {isDeleting ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-trash-can"></i>}
          </button>
        </div>
      </header>

      {/* Invoice Date Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl">
             <h3 className="text-xl font-black mb-6">Issue Invoice Date</h3>
             <input type="date" value={selectedInvoiceDate} onChange={e => setSelectedInvoiceDate(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none mb-6" />
             <div className="flex gap-4">
               <button onClick={() => setShowInvoiceModal(false)} className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase">Cancel</button>
               <button onClick={finalizeInvoice} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl">Confirm</button>
             </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Heading</label>
                <input value={job.description} onChange={e => setJob({...job, description: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl font-black text-lg outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Location</label>
                <input value={job.location} onChange={e => setJob({...job, location: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl font-bold outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">PO Protocol</label>
                <input value={job.poNumber || ''} onChange={e => setJob({...job, poNumber: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl font-bold outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Status</label>
                <select value={job.status} onChange={e => setJob({...job, status: e.target.value as JobStatus})} className={`w-full px-5 py-3.5 border rounded-2xl font-black text-[11px] uppercase ${STATUS_COLORS[job.status]}`}>
                  {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Production Schedule */}
            <div className="pt-8 border-t border-slate-100">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h4 className="text-xs font-black uppercase tracking-widest italic">Production Schedule</h4>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setJob({...job, schedulingType: SchedulingType.CONTINUOUS})} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase ${job.schedulingType === SchedulingType.CONTINUOUS ? 'bg-white shadow-sm' : 'text-slate-400'}`}>Continuous</button>
                  <button onClick={() => setJob({...job, schedulingType: SchedulingType.SHIFT_BASED})} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase ${job.schedulingType === SchedulingType.SHIFT_BASED ? 'bg-white shadow-sm' : 'text-slate-400'}`}>Shift-based</button>
                </div>
              </div>
              
              {job.schedulingType === SchedulingType.SHIFT_BASED ? (
                <div className="space-y-4">
                  {shifts.map((s, idx) => (
                    <div key={s.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
                      <input className="bg-white px-4 py-2 rounded-xl text-xs font-black w-full md:flex-1" value={s.title} onChange={e => { const n = [...shifts]; n[idx].title = e.target.value; setShifts(n); }} />
                      <input type="date" value={s.startDate} className="bg-white px-4 py-2 rounded-xl text-xs font-bold" onChange={e => { const n = [...shifts]; n[idx].startDate = e.target.value; setShifts(n); }} />
                      <button onClick={() => setShifts(shifts.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-500"><i className="fa-solid fa-trash-can"></i></button>
                    </div>
                  ))}
                  <button onClick={() => setShifts([...shifts, { id: generateId(), jobId: job.id, title: 'New Session', startDate: job.startDate, endDate: job.startDate, startTime: '09:00', endTime: '17:30', isFullDay: true, tenant_id: job.tenant_id }])} className="w-full py-4 border-2 border-dashed border-indigo-100 rounded-3xl text-[10px] font-black text-indigo-400 uppercase">+ Add Session</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <input type="date" value={job.startDate} onChange={e => setJob({...job, startDate: e.target.value})} className="w-full px-5 py-3.5 bg-white border rounded-2xl font-bold" />
                  <input type="date" value={job.endDate} onChange={e => setJob({...job, endDate: e.target.value})} className="w-full px-5 py-3.5 bg-white border rounded-2xl font-bold" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest italic mb-2">Project Valuation</p>
            <h4 className="text-4xl font-black tracking-tighter mb-8">{formatCurrency(totalRecharge, currentUser)}</h4>
            <div className="space-y-3">
              <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase"><span>Net</span><span>{formatCurrency(totalRecharge, currentUser)}</span></div>
              <div className="pt-4 border-t border-white/10 flex justify-between items-center"><span className="text-xs font-black uppercase text-white">Gross</span><span className="text-xl font-black text-emerald-400">{formatCurrency(totalRecharge * (currentUser?.isVatRegistered ? (1 + (currentUser.taxRate/100)) : 1), currentUser)}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm">
            <h4 className="text-sm font-black mb-6 italic uppercase tracking-tight">Client Dossier</h4>
            <div className="space-y-4">
              <p className="font-black text-slate-900">{client?.name}</p>
              <p className="text-xs font-bold text-slate-500">{client?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
