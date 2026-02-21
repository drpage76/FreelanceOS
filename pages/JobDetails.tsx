// src/pages/JobDetails.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
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
import { formatCurrency, calculateDueDate } from "../utils";
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

  // mark unpaid modal
  const [showUnpaidModal, setShowUnpaidModal] = useState(false);

  // change invoice date modal (existing invoice)
  const [showEditInvoiceDate, setShowEditInvoiceDate] = useState(false);
  const [editInvoiceDate, setEditInvoiceDate] = useState("");

  // calendar warning (non-blocking)
  const [calendarWarning, setCalendarWarning] = useState<string | null>(null);

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

      // default invoice date for creating invoice = job endDate
      setSelectedInvoiceDate((prev) => prev || foundJob.endDate);

      setShifts(foundJob.shifts || []);

      const jobItems = await DB.getJobItems(id);
      setItems(jobItems || []);

      const allClients = await DB.getClients();
      const foundClient = allClients.find((c) => c.id === foundJob.clientId) || null;
      setClient(foundClient);

      const allInvoices = await DB.getInvoices();
      const inv = allInvoices.find((i) => i.jobId === foundJob.id) || null;
      setInvoice(inv);

      if (inv?.datePaid) setPaidDate(inv.datePaid);
      else setPaidDate(new Date().toISOString().slice(0, 10));

      setEditInvoiceDate(inv?.date || foundJob.endDate);
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

  const normalizeShift = (s: JobShift): JobShift => {
    const startDate = (s as any).startDate || (job as any)?.startDate;
    const endDate = (s as any).endDate || startDate;
    const isFullDay = (s as any).isFullDay !== false; // default true

    return {
      ...s,
      startDate,
      endDate,
      isFullDay,
      startTime: (s as any).startTime || "09:00",
      endTime: (s as any).endTime || "17:30",
    } as any;
  };

  const computeShiftBasedRange = (shiftList: JobShift[]) => {
    const norm = (shiftList || []).map(normalizeShift);
    const startDates = norm.map((s) => (s as any).startDate).filter(Boolean).sort();
    const endDates = norm.map((s) => (s as any).endDate).filter(Boolean).sort();

    return {
      startDate: startDates.length ? startDates[0] : (job as any).startDate,
      endDate: endDates.length ? endDates[endDates.length - 1] : (job as any).endDate,
      normalized: norm,
    };
  };

  const tryCalendarSync = async (updatedJob: Job) => {
    if (!googleAccessToken) return { ok: true as const, warning: null as string | null };

    try {
      if (updatedJob.syncToCalendar === false) {
        await deleteJobFromGoogle((updatedJob as any).googleEventId || updatedJob.id, googleAccessToken);
        return { ok: true as const, warning: null };
      }

      await syncJobToGoogle(updatedJob, googleAccessToken, client?.name);
      return { ok: true as const, warning: null };
    } catch (e: any) {
      const msg = e?.message || "Calendar sync failed.";
      console.warn("[Calendar Sync Failed]", e);
      return { ok: false as const, warning: msg };
    }
  };

  const handleUpdateJob = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!job || isSaving) return;

    setIsSaving(true);
    setCalendarWarning(null);

    let startDate = job.startDate;
    let endDate = job.endDate;
    let normalizedShifts = shifts;

    if (job.schedulingType === SchedulingType.SHIFT_BASED) {
      const { startDate: s, endDate: e2, normalized } = computeShiftBasedRange(shifts || []);
      startDate = s;
      endDate = e2;
      normalizedShifts = normalized;
    }

    const updatedJob: Job = {
      ...job,
      startDate,
      endDate,
      totalRecharge,
      shifts: normalizedShifts,
    };

    try {
      await DB.saveJob(updatedJob);
      await DB.saveJobItems(job.id, items);

      const syncResult = await tryCalendarSync(updatedJob);
      if (!syncResult.ok) setCalendarWarning(syncResult.warning);

      setJob(updatedJob);
      setShifts(normalizedShifts);

      // keep default invoice-create date aligned to new endDate if user hasn't changed it
      setSelectedInvoiceDate((prev) => (prev ? prev : updatedJob.endDate));

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
      if (googleAccessToken) {
        try {
          await deleteJobFromGoogle((job as any).googleEventId || job.id, googleAccessToken);
        } catch (e) {
          console.warn("[Calendar delete failed]", e);
        }
      }

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

  const handleCreateInvoice = async () => {
    if (!job || !client) return;
    const invoiceDate = selectedInvoiceDate || job.endDate;
    if (!invoiceDate) return;

    setIsSaving(true);
    try {
      const terms = Number((client as any).paymentTermsDays) || 30;

      const newInvoice: Invoice = {
        id: job.id,
        jobId: job.id,
        date: invoiceDate,
        dueDate: calculateDueDate(invoiceDate, terms),
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
      setEditInvoiceDate(newInvoice.date);
      setShowInvoiceModal(false);
      await onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to generate invoice.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmChangeInvoiceDate = async () => {
    if (!invoice || !job || !client) return;
    if (!editInvoiceDate) return alert("Please select an invoice date.");

    setIsSaving(true);
    try {
      const terms = Number((client as any).paymentTermsDays) || 30;

      const updated: Invoice = {
        ...invoice,
        date: editInvoiceDate,
        dueDate: calculateDueDate(editInvoiceDate, terms),
      };

      await DB.saveInvoice(updated);
      setInvoice(updated);
      setShowEditInvoiceDate(false);
      await onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to update invoice date.");
    } finally {
      setIsSaving(false);
    }
  };

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

  const confirmMarkInvoiceUnpaid = async () => {
    if (!invoice || !job) return;

    setIsSaving(true);
    try {
      const unpaidInvoice: Invoice = {
        ...invoice,
        status: InvoiceStatus.SENT,
        datePaid: null as any,
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
      {calendarWarning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-[11px] font-bold">
          Saved successfully, but calendar sync failed: <span className="font-mono">{calendarWarning}</span>
          <div className="mt-2 text-[10px] text-amber-700">Tip: try “Sync All” from the dashboard after re-authing Google.</div>
        </div>
      )}

      {/* PREVIEW MODAL (Fixes Quotation / View Invoice buttons) */}
      {showPreview && job && client && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 flex items-center justify-between border-b border-slate-100">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {showPreview === "invoice" ? "Invoice Preview" : "Quotation Preview"}
                </div>
                <div className="font-black text-slate-900 truncate">
                  {job.description} — {client.name}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase shadow-xl"
                >
                  {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : "Download PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(null)}
                  className="px-4 py-2 bg-slate-50 text-slate-500 rounded-xl font-black text-[10px] uppercase border border-slate-100"
                >
                  Close
                </button>
              </div>
            </div>

            {/* This is what gets printed to PDF */}
            <div ref={docRef} className="p-8 bg-white">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-2xl font-black text-slate-900">
                    {showPreview === "invoice" ? "INVOICE" : "QUOTATION"}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 mt-2">
                    Protocol: <span className="font-mono">{job.id}</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">
                    Location: <span className="text-slate-900">{job.location || "-"}</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">
                    PO: <span className="text-slate-900">{job.poNumber || "-"}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {showPreview === "invoice" ? "Invoice Date" : "Quote Date"}
                  </div>
                  <div className="text-[13px] font-black text-slate-900">
                    {showPreview === "invoice" ? (invoice?.date || job.endDate) : job.endDate}
                  </div>

                  {showPreview === "invoice" && (
                    <>
                      <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</div>
                      <div className="text-[12px] font-black text-slate-900">{invoice?.status || "DRAFT"}</div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Bill To
                </div>
                <div className="p-4">
                  <div className="font-black text-slate-900">{client.name}</div>
                  <div className="text-xs font-bold text-slate-600">{client.email || ""}</div>
                  <div className="text-[11px] font-bold text-slate-500 whitespace-pre-wrap mt-2">{client.address || ""}</div>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 grid grid-cols-12 gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <div className="col-span-7">Description</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-3 text-right">Amount</div>
                </div>

                <div className="divide-y divide-slate-100">
                  {(items || []).map((it) => {
                    const amount = (Number(it.qty) * Number(it.unitPrice)) || 0;
                    return (
                      <div key={it.id} className="px-4 py-3 grid grid-cols-12 gap-3 text-[12px] font-bold text-slate-700">
                        <div className="col-span-7 text-slate-900">{it.description || "-"}</div>
                        <div className="col-span-2 text-center">{Number(it.qty) || 0}</div>
                        <div className="col-span-3 text-right">{formatCurrency(amount, currentUser)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <div className="w-full max-w-sm rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Totals
                  </div>
                  <div className="p-4 space-y-2 text-[12px] font-bold">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Net</span>
                      <span className="text-slate-900">{formatCurrency(totalRecharge, currentUser)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-500">Gross</span>
                      <span className="text-slate-900">
                        {formatCurrency(
                          totalRecharge * (currentUser?.isVatRegistered ? 1 + ((currentUser.taxRate || 20) / 100) : 1),
                          currentUser
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {showPreview === "invoice" && (
                <div className="mt-6 text-[10px] font-bold text-slate-500">
                  Payment terms: payment upon receipt of invoice.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ISSUE INVOICE MODAL */}
      {showInvoiceModal && client && job && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Issue Project Invoice</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">
              Client terms: {client.paymentTermsDays || 30} days
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">
                  Invoice Date (default = job end date)
                </label>
                <input
                  type="date"
                  value={selectedInvoiceDate || job.endDate}
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
                  disabled={isSaving || !(selectedInvoiceDate || job.endDate)}
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

      {/* EDIT INVOICE DATE MODAL */}
      {showEditInvoiceDate && invoice && client && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Change Invoice Date</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">
              Invoice Ref: {invoice.id}
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={editInvoiceDate}
                  onChange={(e) => setEditInvoiceDate(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                />
                <p className="mt-2 text-[10px] font-bold text-slate-400">
                  Due date will update automatically using client terms ({client.paymentTermsDays || 30} days).
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditInvoiceDate(false)}
                  className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase border border-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmChangeInvoiceDate}
                  disabled={isSaving || !editInvoiceDate}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2"
                >
                  {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-pen-to-square"></i>}
                  {isSaving ? "Saving..." : "Update Date"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MARK PAID MODAL */}
      {showPaidModal && invoice && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Mark Invoice as Paid</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Invoice Ref: {invoice.id}</p>

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
            </div>
          </div>
        </div>
      )}

      {/* MARK UNPAID MODAL */}
      {showUnpaidModal && invoice && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Mark Invoice as Unpaid</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Invoice Ref: {invoice.id}</p>

            <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
              This will remove the paid date and return the invoice to Outstanding. The job will revert to Awaiting Payment.
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

      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/jobs" className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm">
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
              onClick={() => {
                setSelectedInvoiceDate(job.endDate);
                setShowInvoiceModal(true);
              }}
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

              <button
                type="button"
                onClick={() => {
                  setEditInvoiceDate(invoice.date || job.endDate);
                  setShowEditInvoiceDate(true);
                }}
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase shadow-sm"
              >
                Edit Invoice Date
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

      {/* MAIN GRID (your existing layout continues below; kept shorter here) */}
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

            {/* (keep the rest of your Production Schedule UI here unchanged) */}
          </div>

          {/* Deliverables */}
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