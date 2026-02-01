import React, { useState, useRef, useMemo } from 'react';
// Use direct named imports from react-router to resolve missing Link export in unified environments
import { Link } from 'react-router';

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { AppState, InvoiceStatus, Invoice, Job, Client, JobItem, JobStatus, UserPlan } from '../types';
import { formatCurrency, formatDate, generateInvoiceId, calculateDueDate } from '../utils';
import { STATUS_COLORS } from '../constants';
import { DB } from '../services/db';

interface InvoicesProps {
  state: AppState;
  onRefresh: () => void;
}

export const Invoices: React.FC<InvoicesProps> = ({ state, onRefresh }) => {
  const [previewData, setPreviewData] = useState<{inv: Invoice, job: Job, client: Client, items: JobItem[]} | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<Invoice | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const docRef = useRef<HTMLDivElement>(null);

  const isPro = !!state.user?.plan;

  const financialStats = useMemo(() => {
    let totalPaid = 0;
    let totalOutstanding = 0;
    let expensesTotal = 0;

    (state.invoices || []).forEach(inv => {
      const job = (state.jobs || []).find(j => j.id === inv.jobId);
      const subtotal = job?.totalRecharge || 0;
      const vatMultiplier = state.user?.isVatRegistered ? (1 + (state.user?.taxRate || 20) / 100) : 1.0;
      const val = subtotal * vatMultiplier;
      
      if (inv.status === InvoiceStatus.PAID) totalPaid += val;
      else if (inv.status === InvoiceStatus.SENT || inv.status === InvoiceStatus.OVERDUE) totalOutstanding += val;
    });

    (state.mileage || []).forEach(m => {
      expensesTotal += (m.distanceMiles * (m.isReturn ? 2 : 1) * m.numTrips * 0.45);
    });

    return { totalPaid, totalOutstanding, expensesTotal };
  }, [state.invoices, state.jobs, state.user, state.mileage]);

  const billableRecords = useMemo(() => {
    return state.jobs.filter(j => 
      j.status !== JobStatus.CANCELLED && j.status !== JobStatus.POTENTIAL && j.status !== JobStatus.PENCILLED
    ).map(job => {
      const inv = state.invoices.find(i => i.jobId === job.id);
      const client = state.clients.find(c => c.id === job.clientId);
      const vatMultiplier = state.user?.isVatRegistered ? (1 + (state.user?.taxRate || 20) / 100) : 1.0;
      return { job, client, invoice: inv, status: inv ? inv.status : 'TO BE INVOICED', amount: (job.totalRecharge || 0) * vatMultiplier };
    }).sort((a, b) => new Date(b.job.startDate).getTime() - new Date(a.job.startDate).getTime());
  }, [state.jobs, state.invoices, state.clients, state.user]);

  const handlePreview = async (invoice: Invoice) => {
    setIsProcessing(invoice.id);
    const job = state.jobs.find(j => j.id === invoice.jobId);
    const client = state.clients.find(c => c.id === job?.clientId);
    if (job && client) {
      try {
        const items = await DB.getJobItems(job.id);
        setPreviewData({ inv: invoice, job, client, items });
      } catch (err) { alert("Failed to load invoice items."); }
    }
    setIsProcessing(null);
  };

  const handleSendInvoice = async (invoice: Invoice) => {
    setIsProcessing(invoice.id);
    try {
      await DB.saveInvoice({ ...invoice, status: InvoiceStatus.SENT });
      const job = state.jobs.find(j => j.id === invoice.jobId);
      if (job) await DB.saveJob({ ...job, status: JobStatus.AWAITING_PAYMENT });
      onRefresh();
      setPreviewData(null);
    } catch (err) { alert("Sync failed."); } finally { setIsProcessing(null); }
  };

  const handleDownloadPDF = async () => {
    if (!docRef.current || !previewData) return;
    setIsProcessing('downloading');
    
    // Crucial: Wait for any layout shifts
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
      
      // Calculate dimensions in MM (A4 width is 210mm)
      const pdfWidth = 210;
      const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
      
      // Create PDF with dynamic height to ensure no content is clipped
      const pdf = new jsPDF({ 
        orientation: 'portrait', 
        unit: 'mm', 
        format: [pdfWidth, pdfHeight] 
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Invoice_${previewData.inv.id}.pdf`);
    } catch (err) { 
      console.error(err);
      alert("PDF Export failed."); 
    } finally { 
      setIsProcessing(null); 
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {previewData && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden my-8 border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 sticky top-0 z-[210] backdrop-blur-md">
              <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border ${STATUS_COLORS[previewData.inv.status]}`}>Status: {previewData.inv.status}</span>
              <div className="flex gap-2">
                {previewData.inv.status === InvoiceStatus.DRAFT && (
                  <button onClick={() => handleSendInvoice(previewData.inv)} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-lg">Issue Invoice</button>
                )}
                <button onClick={handleDownloadPDF} disabled={isProcessing === 'downloading'} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-xs uppercase shadow-lg flex items-center gap-2">
                  {isProcessing === 'downloading' ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-file-arrow-down"></i>} PDF
                </button>
                <button onClick={() => setPreviewData(null)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-slate-400 hover:text-rose-500 border border-slate-200"><i className="fa-solid fa-xmark"></i></button>
              </div>
            </div>
            <div className="p-10 bg-slate-50 custom-scrollbar overflow-x-auto">
               <div ref={docRef} className="bg-white p-12 pb-32 border border-slate-100 min-h-[1120px] w-[800px] mx-auto shadow-sm text-slate-900">
                 <div className="flex justify-between items-start mb-20">
                    <div>
                      {state.user?.logoUrl ? (
                        <img src={state.user.logoUrl} alt="Logo" className="h-32 mb-6 object-contain" />
                      ) : (
                        <div className="flex items-center gap-2 mb-6">
                           <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><i className="fa-solid fa-bolt text-lg"></i></div>
                           <span className="text-2xl font-black tracking-tighter">Freelance<span className="text-indigo-400">OS</span></span>
                        </div>
                      )}
                      <h1 className="text-5xl font-black uppercase tracking-tight">Invoice</h1>
                      <p className="text-slate-400 font-bold uppercase text-xs mt-2 tracking-widest">Ref: {previewData.inv.id}</p>
                    </div>
                    <div className="text-right">
                       <p className="font-black text-xl">{state.user?.businessName}</p>
                       <p className="text-sm text-slate-500 whitespace-pre-line leading-relaxed mt-2">{state.user?.businessAddress}</p>
                       {state.user?.vatNumber && <p className="text-[10px] font-black uppercase text-slate-400 mt-2">{state.user?.taxName || 'VAT'}: {state.user.vatNumber}</p>}
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-10 mb-20">
                    <div>
                       <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Billed To</p>
                       <p className="font-black text-xl">{previewData.client.name}</p>
                       <p className="text-sm text-slate-500 whitespace-pre-line leading-relaxed mt-2">{previewData.client.address}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Invoice Details</p>
                       <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-700">Issued: {formatDate(previewData.inv.date)}</p>
                          <p className="text-sm font-black text-indigo-600">Due Date: {formatDate(previewData.inv.dueDate)}</p>
                          
                          <div className="mt-4 pt-4 border-t border-slate-50 space-y-1 text-right">
                             <p className="text-sm font-black text-slate-900 leading-tight">Project: {previewData.job.description}</p>
                             <p className="text-[11px] font-bold text-slate-500 italic">Location: {previewData.job.location || 'TBD'}</p>
                             <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Period: {formatDate(previewData.job.startDate)} — {formatDate(previewData.job.endDate)}</p>
                             {previewData.job.poNumber && (
                               <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest mt-2 border-t border-indigo-50 pt-1 inline-block">Purchase Order: {previewData.job.poNumber}</p>
                             )}
                          </div>
                       </div>
                    </div>
                 </div>

                 <table className="w-full mb-12">
                    <thead>
                       <tr className="border-b-2 border-slate-900">
                          <th className="py-4 text-left text-[10px] font-black uppercase tracking-widest">Description</th>
                          <th className="py-4 text-center text-[10px] font-black uppercase tracking-widest">Qty</th>
                          <th className="py-4 text-right text-[10px] font-black uppercase tracking-widest">Rate</th>
                          <th className="py-4 text-right text-[10px] font-black uppercase tracking-widest">Amount</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {previewData.items.map(it => (
                         <tr key={it.id}>
                            <td className="py-5 font-bold text-slate-700 text-sm">{it.description}</td>
                            <td className="py-5 text-center text-slate-600 font-black text-xs">{it.qty}</td>
                            <td className="py-5 text-right text-slate-600 font-black text-xs">{formatCurrency(it.unitPrice, state.user)}</td>
                            <td className="py-5 text-right font-black text-slate-900 text-sm">{formatCurrency(it.qty * it.unitPrice, state.user)}</td>
                         </tr>
                       ))}
                    </tbody>
                 </table>

                 <div className="flex justify-end pt-10 border-t-2 border-slate-900">
                    <div className="w-64 space-y-4">
                       <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Total</span>
                          <span className="text-xl font-bold text-slate-700">{formatCurrency(previewData.job.totalRecharge, state.user)}</span>
                       </div>
                       {state.user?.isVatRegistered && (
                         <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{state.user?.taxName || 'VAT'} ({state.user?.taxRate || 20}%)</span>
                            <span className="text-xl font-bold text-slate-700">{formatCurrency(previewData.job.totalRecharge * ((state.user?.taxRate || 20) / 100), state.user)}</span>
                         </div>
                       )}
                       <div className="flex justify-between items-center pt-4 border-t-2 border-slate-900">
                          <span className="text-xs font-black uppercase tracking-widest">Total Payable</span>
                          <span className="text-3xl font-black text-indigo-600">
                            {formatCurrency(previewData.job.totalRecharge * (state.user?.isVatRegistered ? (1 + (state.user?.taxRate || 20) / 100) : 1), state.user)}
                          </span>
                       </div>
                    </div>
                 </div>

                 <div className="mt-20 pt-10 border-t border-slate-100 grid grid-cols-2 gap-10">
                    <div>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Remittance Details</p>
                       <div className="bg-slate-50 p-6 rounded-2xl font-mono text-[11px] text-slate-700 leading-relaxed border border-slate-100 shadow-inner">
                         {state.user?.accountName && <p className="font-black mb-1">{state.user.accountName}</p>}
                         {state.user?.accountNumber && <p>Acc: {state.user.accountNumber}</p>}
                         {state.user?.sortCodeOrIBAN && <p>Sort/IBAN: {state.user.sortCodeOrIBAN}</p>}
                         {!state.user?.accountName && !state.user?.accountNumber && <p className="text-slate-400 italic">Configure banking in Workspace Settings.</p>}
                       </div>
                    </div>
                    <div>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Notes</p>
                       <p className="text-[11px] text-slate-500 leading-relaxed font-medium italic">Thank you for your prompt settlement. Please quote invoice reference {previewData.inv.id} on all payments.</p>
                    </div>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-2">Financial Ledger</h2>
          <p className="text-slate-500 font-medium">Full reporting for project lifecycle and settlements.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl min-w-[140px] shadow-sm"><p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Settled Income</p><p className="text-xl font-black text-emerald-900">{formatCurrency(financialStats.totalPaid, state.user)}</p></div>
          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl min-w-[140px] shadow-sm"><p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Accounts Receivable</p><p className="text-xl font-black text-indigo-900">{formatCurrency(financialStats.totalOutstanding, state.user)}</p></div>
        </div>
      </header>

      <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
         <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-6">Doc Ref</th>
                <th className="p-6">Project / Description</th>
                <th className="p-6">Status</th>
                <th className="p-6 text-right">Gross Val</th>
                <th className="p-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {billableRecords.length === 0 ? (
                <tr><td colSpan={5} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No project history recorded</td></tr>
              ) : (
                billableRecords.map(record => {
                  const { job, client, invoice, status, amount } = record;
                  const isProcessingRow = isProcessing === (invoice?.id || job.id);
                  return (
                    <tr key={invoice?.id || job.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-6 font-black text-xs text-indigo-600">{invoice?.id || <span className="text-slate-300 italic">Unissued</span>}</td>
                      <td className="p-6">
                        <p className="font-black text-slate-900 leading-tight">{job.description}</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-tight mt-1">{client?.name || 'Private Client'}</p>
                      </td>
                      <td className="p-6">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border ${STATUS_COLORS[status] || 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                          {status}
                        </span>
                      </td>
                      <td className="p-6 text-right font-black text-slate-900">{formatCurrency(amount, state.user)}</td>
                      <td className="p-6 text-center">
                        {invoice ? (
                          <button onClick={() => handlePreview(invoice)} disabled={isProcessingRow} className="bg-slate-900 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all">Open Doc</button>
                        ) : (
                          <Link to={`/jobs/${job.id}`} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all">Go to Workspace</Link>
                        )}
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