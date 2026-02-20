// src/pages/JobDetails.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import {
  Job,
  JobItem,
  JobStatus,
  Client,
  Invoice,
  InvoiceStatus,
  JobShift,
  Tenant,
  SchedulingType,
} from "../types";

import { DB, generateId } from "../services/db";
import { formatCurrency, formatDate, calculateDueDate } from "../utils";
import { STATUS_COLORS } from "../constants";
import { syncJobToGoogle, deleteJobFromGoogle } from "../services/googleCalendar";
import { uploadToGoogleDrive } from "../services/googleDrive";

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
  const [currentUser, setCurrentUser] = useState<Tenant | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPreview, setShowPreview] = useState<"invoice" | "quote" | null>(null);
  const [selectedInvoiceDate, setSelectedInvoiceDate] = useState("");

  // paid date picker
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // NEW: mark unpaid modal
  const [showUnpaidModal, setShowUnpaidModal] = useState(false);

  const docRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    if (!id) return;
    setIsLoading(true);

    try {
      const user = await DB.getCurrentUser();
      setCurrentUser(user);

      const allJobs = await DB.getJobs();
      const foundJob = allJobs.find((j) => j.id === id);

      if (!foundJob) {
        navigate("/jobs");
        return;
      }

      setJob(foundJob);
      if (!selectedInvoiceDate) setSelectedInvoiceDate(foundJob.endDate);

      setShifts(foundJob.shifts || []);

      const jobItems = await DB.getJobItems(id);
      setItems(jobItems || []);

      const allClients = await DB.getClients();
      const foundClient = allClients.find((c) => c.id === foundJob.clientId) || null;
      setClient(foundClient);

      const allInvoices = await DB.getInvoices();
      const inv = allInvoices.find((i) => i.jobId === foundJob.id) || null;
      setInvoice(inv);

      // default paid date if already paid
      if (inv?.datePaid) setPaidDate(inv.datePaid);
      else setPaidDate(new Date().toISOString().slice(0, 10));
    } catch (err) {
      console.error("Fetch Data Protocol Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totalRecharge = useMemo(
    () => (items || []).reduce((sum, item) => sum + (Number(item.qty) * Number(item.unitPrice) || 0), 0),
    [items]
  );

  const handleAddItem = () => {
    if (!id) return;
    setItems((prev) => [
      ...(prev || []),
      {
        id: generateId(),
        jobId: id,
        description: "",
        qty: 1,
        unitPrice: 0,
        rechargeAmount: 0,
        actualCost: 0,
      },
    ]);
  };

  const handleUpdateItem = (idx: number, field: string, val: any) => {
    setItems((prev) => {
      const next = [...(prev || [])];
      (next[idx] as any)[field] = val;
      return next;
    });
  };

  const handleRemoveItem = (idx: number) => {
    setItems((prev) => ((prev || []).length <= 1 ? prev : (prev || []).filter((_, i) => i !== idx)));
  };

  const handleUpdateJob = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!job || isSaving) return;

    setIsSaving(true);

    let startDate = job.startDate;
    let endDate = job.endDate;

    if (job.schedulingType === SchedulingType.SHIFT_BASED && (shifts || []).length > 0) {
      const startDates = shifts.map((s) => s.startDate).filter(Boolean).sort();
      const endDates = shifts.map((s) => s.endDate).filter(Boolean).sort();
      if (startDates.length > 0) startDate = startDates[0]!;
      if (endDates.length > 0) endDate = endDates[endDates.length - 1]!;
    }

    const updatedJob: Job = {
      ...job,
      startDate,
      endDate,
      totalRecharge,
      shifts,
    };

    try {
      await DB.saveJob(updatedJob);
      await DB.saveJobItems(job.id, items);

      // ✅ FIX: if sync disabled, remove from google instead of syncing
      if (googleAccessToken) {
        if (updatedJob.syncToCalendar === false) {
          await deleteJobFromGoogle(updatedJob.id, googleAccessToken);
        } else {
          await syncJobToGoogle(updatedJob, googleAccessToken, client?.name);
        }
      }

      setJob(updatedJob);
      await onRefresh();
    } catch (err: any) {
      alert(`Save Error: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!docRef.current || !job || !client) return;

    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 100));

    try {
      const element = docRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      const titleLabel = showPreview === "invoice" ? "Invoice" : "Quotation";
      const fileName = `${titleLabel} ${job.id} ${client.name}.pdf`;
      pdf.save(fileName);

      if (googleAccessToken && currentUser?.businessName) {
        const pdfBlob = pdf.output("blob");
        const folderName = `${currentUser.businessName} Documents`;
        await uploadToGoogleDrive(googleAccessToken, folderName, fileName, pdfBlob);
      }
    } catch (err) {
      console.error(err);
      alert("PDF Export failed.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteJob = async () => {
    if (!job) return;
    if (!window.confirm("Are you sure you want to delete this project and clear all associated calendar events?")) return;

    setIsDeleting(true);
    try {
      if (googleAccessToken) await deleteJobFromGoogle(job.id, googleAccessToken);
      await DB.deleteJob(job.id);
      await onRefresh();
      navigate("/jobs");
    } catch (err) {
      console.error(err);
      alert("System failed to complete deletion protocol.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Create draft invoice
  const handleCreateInvoice = async () => {
    if (!job || !client || !selectedInvoiceDate) return;

    setIsSaving(true);
    try {
      const terms = Number((client as any).paymentTermsDays) || 30;

      const newInvoice: Invoice = {
        id: job.id,
        jobId: job.id,
        date: selectedInvoiceDate,
        dueDate: calculateDueDate(selectedInvoiceDate, terms),
        status: InvoiceStatus.DRAFT,
        tenant_id: job.tenant_id,
      };

      await DB.saveInvoice(newInvoice);

      if (job.status !== JobStatus.CANCELLED && job.status !== JobStatus.COMPLETED) {
        const updatedJob: Job = { ...job, status: JobStatus.AWAITING_PAYMENT };
        await DB.saveJob(updatedJob);
        setJob(updatedJob);
      }

      setInvoice(newInvoice);
      setShowInvoiceModal(false);
      await onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to generate invoice.");
    } finally {
      setIsSaving(false);
    }
  };

  // Mark paid -> invoice PAID + job COMPLETED
  const confirmMarkInvoicePaid = async () => {
    if (!invoice || !job) return;
    if (!paidDate) return alert("Please select the date the payment was made.");

    setIsSaving(true);
    try {
      const paidInvoice: Invoice = {
        ...invoice,
        status: InvoiceStatus.PAID,
        datePaid: paidDate,
      };

      await DB.saveInvoice(paidInvoice);

      if (job.status !== JobStatus.CANCELLED) {
        const updatedJob: Job = { ...job, status: JobStatus.COMPLETED };
        await DB.saveJob(updatedJob);
        setJob(updatedJob);
      }

      setInvoice(paidInvoice);
      setShowPaidModal(false);
      await onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to mark invoice as paid.");
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ NEW: Mark unpaid -> clear datePaid, set invoice back to SENT, job back to AWAITING_PAYMENT
  const confirmMarkInvoiceUnpaid = async () => {
    if (!invoice || !job) return;

    setIsSaving(true);
    try {
      const unpaidInvoice: Invoice = {
        ...invoice,
        status: InvoiceStatus.SENT,
        datePaid: null as any, // force clear in DB
      };

      await DB.saveInvoice(unpaidInvoice);

      if (job.status !== JobStatus.CANCELLED) {
        const updatedJob: Job = { ...job, status: JobStatus.AWAITING_PAYMENT };
        await DB.saveJob(updatedJob);
        setJob(updatedJob);
      }

      setInvoice(unpaidInvoice);
      setShowUnpaidModal(false);
      await onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to mark invoice as unpaid.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
        Syncing Engine...
      </div>
    );
  }
  if (!job) return null;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-20 px-1 md:px-4">
      {/* Issue Invoice Modal */}
      {showInvoiceModal && client && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Issue Project Invoice</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">
              Client terms: {client.paymentTermsDays || 30} days
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">
                  Date of Issue
                </label>
                <input
                  type="date"
                  value={selectedInvoiceDate}
                  onChange={(e) => setSelectedInvoiceDate(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase border border-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateInvoice}
                  disabled={isSaving || !selectedInvoiceDate}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2"
                >
                  {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-file-invoice-dollar"></i>}
                  {isSaving ? "Creating..." : "Create Draft"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {showPaidModal && invoice && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Mark Invoice as Paid</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">
              Invoice Ref: {invoice.id}
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaidModal(false)}
                  className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase border border-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmMarkInvoicePaid}
                  disabled={isSaving || !paidDate}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2"
                >
                  {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-circle-check"></i>}
                  {isSaving ? "Saving..." : "Confirm Paid"}
                </button>
              </div>

              <p className="text-[10px] text-slate-400 font-bold leading-relaxed pt-2">
                This will set the invoice to <span className="text-emerald-600">Paid</span> and the job status to{" "}
                <span className="text-slate-900">Completed</span>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ✅ NEW: Mark Unpaid Modal */}
      {showUnpaidModal && invoice && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Mark Invoice as Unpaid</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">
              Invoice Ref: {invoice.id}
            </p>

            <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
              This will remove the paid date and return the invoice to Outstanding.
              The job will revert to Awaiting Payment.
            </p>

            <div className="flex gap-3 pt-6">
              <button
                type="button"
                onClick={() => setShowUnpaidModal(false)}
                className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase border border-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMarkInvoiceUnpaid}
                disabled={isSaving}
                className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2"
              >
                {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-rotate-left"></i>}
                {isSaving ? "Saving..." : "Confirm Unpaid"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && client && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden my-8 border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 sticky top-0 z-[210] backdrop-blur-md">
              <span className="px-4 py-2 rounded-xl text-[10px] font-black uppercase border bg-indigo-50 text-indigo-600 border-indigo-100">
                {showPreview === "invoice" ? "Invoice Preview" : "Quotation Preview"}
              </span>

              <div className="flex gap-2">
                {showPreview === "invoice" && invoice && invoice.status !== InvoiceStatus.PAID && (
                  <button
                    type="button"
                    onClick={() => setShowPaidModal(true)}
                    disabled={isSaving}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase shadow-lg flex items-center gap-2"
                  >
                    {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-circle-check"></i>}
                    Mark Paid
                  </button>
                )}

                {showPreview === "invoice" && invoice && invoice.status === InvoiceStatus.PAID && (
                  <button
                    type="button"
                    onClick={() => setShowUnpaidModal(true)}
                    disabled={isSaving}
                    className="px-6 py-2 bg-rose-600 text-white rounded-xl font-black text-xs uppercase shadow-lg flex items-center gap-2"
                  >
                    {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-rotate-left"></i>}
                    Mark Unpaid
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={isSaving}
                  className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-xs uppercase shadow-lg flex items-center gap-2"
                >
                  {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-file-arrow-down"></i>}
                  PDF
                </button>

                <button
                  type="button"
                  onClick={() => setShowPreview(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-slate-400 hover:text-rose-500 border border-slate-200"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            <div className="p-10 bg-slate-50 overflow-x-auto custom-scrollbar">
              <div
                ref={docRef}
                className="bg-white p-12 pb-32 border border-slate-100 min-h-[1120px] w-[800px] mx-auto shadow-sm text-slate-900"
              >
                <div className="flex justify-between items-start mb-20">
                  <div>
                    {currentUser?.logoUrl ? (
                      <img src={currentUser.logoUrl} alt="Logo" className="h-24 mb-6 object-contain" />
                    ) : (
                      <div className="flex items-center gap-2 mb-6 text-3xl font-black italic">
                        Freelance<span className="text-indigo-600">OS</span>
                      </div>
                    )}
                    <h1 className="text-5xl font-black uppercase tracking-tight">
                      {showPreview === "quote" ? "Quotation" : "Invoice"}
                    </h1>
                    <p className="text-slate-400 font-bold uppercase text-xs mt-2 tracking-widest">Ref: {job.id}</p>

                    {showPreview === "invoice" && invoice && (
                      <p className="text-[10px] font-black uppercase mt-2">
                        <span className={`px-3 py-1 rounded-full border ${STATUS_COLORS[invoice.status]}`}>
                          {invoice.status}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="font-black text-xl">{currentUser?.businessName}</p>
                    <p className="text-sm text-slate-500 whitespace-pre-line leading-relaxed mt-2">
                      {currentUser?.businessAddress}
                    </p>
                    {currentUser?.vatNumber && (
                      <p className="text-[10px] font-black uppercase text-slate-400 mt-2">
                        {currentUser?.taxName || "VAT"}: {currentUser.vatNumber}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-10 mb-20">
                  <div>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">
                      {showPreview === "quote" ? "Recipient" : "Billed To"}
                    </p>
                    <p className="font-black text-xl">{client.name}</p>
                    <p className="text-sm text-slate-500 whitespace-pre-line leading-relaxed mt-2">{client.address}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Document Details</p>
                    <div className="space-y-1">
                      {showPreview === "invoice" && invoice ? (
                        <>
                          <p className="text-sm font-bold text-slate-700">Issued: {formatDate(invoice.date)}</p>
                          <p className="text-sm font-black text-indigo-600">Due Date: {formatDate(invoice.dueDate)}</p>
                          {invoice.datePaid && (
                            <p className="text-[11px] font-black text-emerald-600">Paid: {formatDate(invoice.datePaid)}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm font-bold text-slate-700">Issued: {formatDate(new Date().toISOString())}</p>
                      )}

                      <div className="mt-4 pt-4 border-t border-slate-50 space-y-1 text-right">
                        <p className="text-sm font-black text-slate-900 leading-tight">Project: {job.description}</p>
                        <p className="text-[11px] font-bold text-slate-500 italic">Location: {job.location || "TBD"}</p>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                          Period: {formatDate(job.startDate)} — {formatDate(job.endDate)}
                        </p>
                        {job.poNumber && (
                          <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest mt-2">PO Ref: {job.poNumber}</p>
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
                    {(items || []).map((it) => (
                      <tr key={it.id}>
                        <td className="py-5 font-bold text-slate-700 text-sm">{it.description}</td>
                        <td className="py-5 text-center text-slate-600 font-black text-xs">{it.qty}</td>
                        <td className="py-5 text-right text-slate-600 font-black text-xs">{formatCurrency(it.unitPrice, currentUser)}</td>
                        <td className="py-5 text-right font-black text-slate-900 text-sm">
                          {formatCurrency(Number(it.qty) * Number(it.unitPrice), currentUser)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end pt-10 border-t-2 border-slate-900">
                  <div className="w-64 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal</span>
                      <span className="text-xl font-bold text-slate-700">{formatCurrency(totalRecharge, currentUser)}</span>
                    </div>

                    {currentUser?.isVatRegistered && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {currentUser?.taxName || "VAT"} ({currentUser?.taxRate || 20}%)
                        </span>
                        <span className="text-xl font-bold text-slate-700">
                          {formatCurrency(totalRecharge * ((currentUser?.taxRate || 20) / 100), currentUser)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-4 border-t-2 border-slate-900">
                      <span className="text-xs font-black uppercase tracking-widest">Total</span>
                      <span className="text-3xl font-black text-indigo-600">
                        {formatCurrency(
                          totalRecharge * (currentUser?.isVatRegistered ? 1 + ((currentUser.taxRate || 20) / 100) : 1),
                          currentUser
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-20 pt-10 border-t border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Terms & Conditions</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium italic">
                    This {showPreview === "quote" ? "quotation" : "invoice"} is subject to standard service terms.{" "}
                    {showPreview === "quote" ? "Valid for 30 days." : ""} Payment is required within{" "}
                    {client?.paymentTermsDays || 30} days of issue.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/jobs"
            className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm"
          >
            <i className="fa-solid fa-arrow-left"></i>
          </Link>
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 truncate">{job.description}</h2>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Protocol {job.id}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPreview("quote")}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase shadow-sm"
          >
            Quotation
          </button>

          {!invoice ? (
            <button
              type="button"
              onClick={() => setShowInvoiceModal(true)}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg"
            >
              Issue Invoice
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowPreview("invoice")}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg"
              >
                View Invoice
              </button>

              {invoice.status !== InvoiceStatus.PAID ? (
                <button
                  type="button"
                  onClick={() => setShowPaidModal(true)}
                  disabled={isSaving}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg"
                >
                  Mark Paid
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUnpaidModal(true)}
                  disabled={isSaving}
                  className="px-4 py-2.5 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg"
                >
                  Mark Unpaid
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => handleUpdateJob()}
            disabled={isSaving}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase shadow-xl hover:bg-black transition-all"
          >
            {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : "Save Changes"}
          </button>

          <button
            type="button"
            onClick={handleDeleteJob}
            disabled={isDeleting}
            className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl border border-rose-100 flex items-center justify-center transition-all hover:bg-rose-500 hover:text-white"
          >
            {isDeleting ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-trash-can"></i>}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Heading</label>
                <input
                  value={job.description}
                  onChange={(e) => setJob({ ...job, description: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl font-black text-lg outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Location</label>
                <input
                  value={job.location}
                  onChange={(e) => setJob({ ...job, location: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">PO Protocol</label>
                <input
                  value={job.poNumber || ""}
                  onChange={(e) => setJob({ ...job, poNumber: e.target.value })}
                  className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Status</label>
                <select
                  value={job.status}
                  onChange={(e) => setJob({ ...job, status: e.target.value as any })}
                  className={`w-full px-5 py-3.5 border rounded-2xl font-black text-[11px] uppercase ${STATUS_COLORS[job.status]}`}
                >
                  {Object.values(JobStatus).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Production Schedule */}
            <div className="pt-8 border-t border-slate-100">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h4 className="text-xs font-black uppercase tracking-widest italic">Production Schedule & Sync</h4>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() =>
                      setJob((prev) => (prev ? { ...prev, schedulingType: SchedulingType.CONTINUOUS, syncToCalendar: true } : prev))
                    }
                    className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                      job.syncToCalendar && job.schedulingType === SchedulingType.CONTINUOUS
                        ? "bg-white shadow-sm text-indigo-600"
                        : "text-slate-400"
                    }`}
                  >
                    Continuous
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setJob((prev) => (prev ? { ...prev, schedulingType: SchedulingType.SHIFT_BASED, syncToCalendar: true } : prev))
                    }
                    className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                      job.syncToCalendar && job.schedulingType === SchedulingType.SHIFT_BASED
                        ? "bg-white shadow-sm text-indigo-600"
                        : "text-slate-400"
                    }`}
                  >
                    Shift-based
                  </button>

                  <button
                    type="button"
                    onClick={() => setJob((prev) => (prev ? { ...prev, syncToCalendar: false } : prev))}
                    className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                      job.syncToCalendar === false ? "bg-rose-500 text-white shadow-sm" : "text-slate-400"
                    }`}
                  >
                    None
                  </button>
                </div>
              </div>

              {job.schedulingType === SchedulingType.SHIFT_BASED ? (
                <div className="space-y-4">
                  {(shifts || []).map((s, idx) => (
                    <div key={s.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
                      <input
                        className="bg-white px-4 py-2 rounded-xl text-xs font-black w-full md:flex-1"
                        placeholder="Shift Title"
                        value={s.title}
                        onChange={(e) => {
                          const n = [...shifts];
                          n[idx].title = e.target.value;
                          setShifts(n);
                        }}
                      />
                      <input
                        type="date"
                        value={s.startDate}
                        className="bg-white px-4 py-2 rounded-xl text-xs font-bold"
                        onChange={(e) => {
                          const n = [...shifts];
                          n[idx].startDate = e.target.value;
                          setShifts(n);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShifts((prev) => (prev || []).filter((_, i) => i !== idx))}
                        className="text-slate-300 hover:text-rose-500"
                      >
                        <i className="fa-solid fa-trash-can text-xs"></i>
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setShifts((prev) => [
                        ...(prev || []),
                        {
                          id: generateId(),
                          jobId: job.id,
                          title: "New Session",
                          startDate: job.startDate,
                          endDate: job.startDate,
                          startTime: "09:00",
                          endTime: "17:30",
                          isFullDay: true,
                          tenant_id: job.tenant_id,
                        },
                      ])
                    }
                    className="w-full py-4 border-2 border-dashed border-indigo-100 rounded-3xl text-[10px] font-black text-indigo-400 uppercase"
                  >
                    + Add Session
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase px-1">Start Date</label>
                    <input
                      type="date"
                      value={job.startDate}
                      onChange={(e) => setJob({ ...job, startDate: e.target.value })}
                      className="w-full px-5 py-3.5 bg-white border rounded-2xl font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase px-1">End Date</label>
                    <input
                      type="date"
                      value={job.endDate}
                      onChange={(e) => setJob({ ...job, endDate: e.target.value })}
                      className="w-full px-5 py-3.5 bg-white border rounded-2xl font-bold"
                    />
                  </div>
                </div>
              )}

              {job.syncToCalendar === false && (
                <div className="mt-6 p-4 bg-rose-50/50 border border-rose-100 rounded-2xl text-center">
                  <p className="text-[9px] font-black text-rose-400 uppercase italic">
                    Synchronization disabled. Job will be removed from all external and internal calendars on save.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Deliverables Section */}
          <div className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black uppercase tracking-widest italic">Entries & Deliverables</h4>
              <button type="button" onClick={handleAddItem} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">
                + Add Entry
              </button>
            </div>

            <div className="space-y-3">
              {(items || []).map((item, idx) => (
                <div key={item.id} className="grid grid-cols-12 gap-3 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100 group">
                  <div className="col-span-6 space-y-1">
                    <span className="text-[7px] font-black text-slate-400 uppercase px-1">Description</span>
                    <input
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                      placeholder="Service description..."
                      value={item.description}
                      onChange={(e) => handleUpdateItem(idx, "description", e.target.value)}
                    />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <span className="text-[7px] font-black text-slate-400 uppercase px-1">Qty</span>
                    <input
                      type="number"
                      step="any"
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-center outline-none"
                      value={item.qty}
                      onChange={(e) => handleUpdateItem(idx, "qty", parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="col-span-3 space-y-1">
                    <span className="text-[7px] font-black text-slate-400 uppercase px-1">Rate</span>
                    <input
                      type="number"
                      step="any"
                      className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-right outline-none"
                      value={item.unitPrice}
                      onChange={(e) => handleUpdateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="col-span-1 flex justify-center pb-2">
                    <button type="button" onClick={() => handleRemoveItem(idx)} className="text-slate-300 hover:text-rose-500 transition-colors">
                      <i className="fa-solid fa-trash-can text-[10px]"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest italic mb-2">Project Valuation</p>
            <h4 className="text-4xl font-black tracking-tighter mb-8">{formatCurrency(totalRecharge, currentUser)}</h4>

            <div className="space-y-3">
              <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase">
                <span>Net</span>
                <span>{formatCurrency(totalRecharge, currentUser)}</span>
              </div>
              <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                <span className="text-xs font-black uppercase text-white">Gross</span>
                <span className="text-xl font-black text-emerald-400">
                  {formatCurrency(
                    totalRecharge * (currentUser?.isVatRegistered ? 1 + ((currentUser.taxRate || 20) / 100) : 1),
                    currentUser
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm">
            <h4 className="text-sm font-black mb-6 italic uppercase tracking-tight">Client Dossier</h4>
            <div className="space-y-4">
              <p className="font-black text-slate-900">{client?.name}</p>
              <p className="text-xs font-bold text-slate-500">{client?.email}</p>
              <p className="text-[10px] text-slate-400 leading-relaxed italic">{client?.address}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};