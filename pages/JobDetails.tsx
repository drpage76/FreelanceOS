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

  const [showEditInvoiceDateModal, setShowEditInvoiceDateModal] = useState(false);
  const [editInvoiceDate, setEditInvoiceDate] = useState("");

  const [showPaidModal, setShowPaidModal] = useState(false);
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const [showUnpaidModal, setShowUnpaidModal] = useState(false);

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
      setShifts(foundJob.shifts || []);

      const jobItems = await DB.getJobItems(id);
      setItems(jobItems || []);

      const allClients = await DB.getClients();
      const foundClient = allClients.find((c) => c.id === foundJob.clientId) || null;
      setClient(foundClient);

      const allInvoices = await DB.getInvoices();
      const inv = allInvoices.find((i) => i.jobId === foundJob.id) || null;
      setInvoice(inv);

      const defaultInvoiceDate = inv?.date || foundJob.endDate || foundJob.startDate || "";
      setSelectedInvoiceDate(defaultInvoiceDate);
      setEditInvoiceDate(inv?.date || defaultInvoiceDate);

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

  const normalizeShift = (s: JobShift): JobShift => {
    const startDate = (s as any).startDate || (job as any)?.startDate;
    const endDate = (s as any).endDate || startDate;
    const isFullDay = (s as any).isFullDay !== false;

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

    const startDates = norm
      .map((s) => (s as any).startDate)
      .filter(Boolean)
      .sort();

    const endDates = norm
      .map((s) => (s as any).endDate)
      .filter(Boolean)
      .sort();

    return {
      startDate: startDates.length ? startDates[0] : (job as any).startDate,
      endDate: endDates.length ? endDates[endDates.length - 1] : (job as any).endDate,
      normalized: norm,
    };
  };

  const tryCalendarSync = async (updatedJob: Job) => {
    if (!googleAccessToken) return { ok: true as const, warning: null as string | null };

    try {
      if (updatedJob.syncToCalendar === false || updatedJob.status === JobStatus.CANCELLED) {
        await deleteJobFromGoogle(updatedJob.id, googleAccessToken);
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
      await onRefresh();
    } catch (err: any) {
      alert(`Save Error: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * ✅ Improved PDF export:
   * - Adds a safe "page padding" wrapper so text doesn't sit on the edges.
   * - Captures at higher quality.
   */
  const handleDownloadPDF = async () => {
    if (!docRef.current || !job || !client) return;

    setIsSaving(true);

    await new Promise((r) => setTimeout(r, 250));

    try {
      const element = docRef.current;

      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollY: -window.scrollY,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = 210;
      const pageHeight = 297;

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = position - pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const titleLabel = showPreview === "invoice" ? "Invoice" : "Quotation";
      const safeClient = (client.name || "Client").replace(/[\/\\:*?"<>|]/g, "-");
      const fileName = `${titleLabel} ${job.id} ${safeClient}.pdf`;
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
          await deleteJobFromGoogle(job.id, googleAccessToken);
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

  const confirmEditInvoiceDate = async () => {
    if (!invoice || !client) return;
    if (!editInvoiceDate) return alert("Please choose an invoice date.");

    if (invoice.status === InvoiceStatus.PAID) {
      alert("This invoice is marked PAID. For safety, invoice date cannot be edited once paid.");
      return;
    }

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
      setShowEditInvoiceDateModal(false);
      setSelectedInvoiceDate(updated.date);

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

  const invoiceDateForDisplay =
    (invoice?.date || selectedInvoiceDate || job?.endDate || job?.startDate || "").trim();

  const invoiceDueDateForDisplay =
    invoice?.dueDate ||
    (client ? calculateDueDate(invoiceDateForDisplay, Number((client as any).paymentTermsDays) || 30) : "");

  const fromName = (currentUser?.businessName || "Your Business").trim();
  const fromAddress = (currentUser?.businessAddress || "").trim();
  const fromReg = (currentUser as any)?.companyRegNumber || "";
  const fromVat = (currentUser as any)?.vatNumber || "";
  const logoUrl = (currentUser as any)?.logoUrl || "";

  const bankAccountName = (currentUser as any)?.accountName || "";
  const bankAccountNumber = (currentUser as any)?.accountNumber || "";
  const bankSortOrIban = (currentUser as any)?.sortCodeOrIBAN || "";

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
          <div className="mt-2 text-[10px] text-amber-700">
            Tip: try “Sync All” from the dashboard after re-authing Google.
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && client && job && (
        <div className="fixed inset-0 z-[240] bg-slate-900/60 backdrop-blur-md overflow-y-auto">
          <div className="min-h-full w-full flex items-start justify-center p-4 md:p-8">
            <div className="w-full max-w-4xl bg-white rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden max-h-[88vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {showPreview === "invoice" ? "Invoice Preview" : "Quotation Preview"}
                  </div>
                  <div className="text-lg font-black text-slate-900 truncate">{job.description}</div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPreview(null)}
                  className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center"
                  title="Close"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto bg-white">
                <div className="px-4 md:px-6 py-6 bg-white">
                  {/* Printable area */}
                  <div
                    ref={docRef}
                    className="bg-white"
                    style={{
                      // ✅ Safe A4-ish padding for PDF capture
                      padding: "28px",
                    }}
                  >
                    {/* Top band: logo + FROM */}
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-5">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt="Logo"
                            // ✅ at least 2x larger than before (was w-14 h-14)
                            className="w-28 h-28 rounded-3xl object-contain border border-slate-200 bg-white"
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <div className="w-28 h-28 rounded-3xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 text-sm font-black">
                            LOGO
                          </div>
                        )}

                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            From
                          </div>
                          <div className="text-base font-black text-slate-900">{fromName}</div>

                          {fromAddress ? (
                            <div className="text-[10px] text-slate-500 leading-relaxed whitespace-pre-wrap mt-1">
                              {fromAddress}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 mt-1">
                              (Add your business address in Settings)
                            </div>
                          )}

                          {(fromReg || fromVat) && (
                            <div className="mt-2 text-[10px] text-slate-500 font-bold space-y-1">
                              {fromReg && (
                                <div>
                                  Company Reg: <span className="font-black text-slate-900">{fromReg}</span>
                                </div>
                              )}
                              {fromVat && (
                                <div>
                                  VAT: <span className="font-black text-slate-900">{fromVat}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Document title + dates */}
                      <div className="text-right">
                        <div className="text-2xl font-black text-slate-900">
                          {showPreview === "invoice" ? "INVOICE" : "QUOTATION"}
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Protocol {job.id}
                        </div>

                        <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {showPreview === "invoice" ? "Invoice Date" : "Quote Date"}
                        </div>
                        <div className="text-sm font-black text-slate-900">{formatDate(invoiceDateForDisplay)}</div>

                        {showPreview === "invoice" && (
                          <>
                            <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Due Date
                            </div>
                            <div className="text-sm font-black text-slate-900">
                              {formatDate(invoiceDueDateForDisplay)}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* BILL TO + JOB DETAILS */}
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-4 rounded-2xl border border-slate-200">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          Bill To
                        </div>
                        <div className="font-black text-slate-900">{client.name}</div>
                        <div className="text-xs font-bold text-slate-500">{client.email}</div>
                        <div className="text-[10px] text-slate-400 leading-relaxed mt-2 whitespace-pre-wrap">
                          {client.address}
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl border border-slate-200">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          Job Details
                        </div>

                        {/* ✅ show Job Name + Location */}
                        <div className="text-xs font-black text-slate-900">{job.description || "—"}</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-1">{job.location || "—"}</div>

                        <div className="text-xs font-bold text-slate-500 mt-2">
                          {formatDate(job.startDate)} → {formatDate(job.endDate)}
                        </div>

                        <div className="text-[10px] text-slate-400 mt-2">
                          PO: <span className="font-black text-slate-900">{job.poNumber || "—"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Status: <span className="font-black text-slate-900">{job.status}</span>
                        </div>
                      </div>
                    </div>

                    {/* LINE ITEMS */}
                    <div className="mt-8">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                        Line Items
                      </div>

                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="grid grid-cols-12 gap-2 bg-slate-50 p-3 text-[10px] font-black uppercase text-slate-500">
                          <div className="col-span-7">Description</div>
                          <div className="col-span-2 text-right">Qty</div>
                          <div className="col-span-3 text-right">Amount</div>
                        </div>

                        {(items || []).map((it) => {
                          const amt = Number(it.qty) * Number(it.unitPrice) || 0;
                          return (
                            <div key={it.id} className="grid grid-cols-12 gap-2 p-3 border-t border-slate-100 text-sm">
                              <div className="col-span-7 font-bold text-slate-900">{it.description || "—"}</div>
                              <div className="col-span-2 text-right font-black text-slate-700">{it.qty}</div>
                              <div className="col-span-3 text-right font-black text-slate-900">
                                {formatCurrency(amt, currentUser)}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-6 flex justify-end">
                        <div className="w-full max-w-sm space-y-2">
                          <div className="flex justify-between text-sm font-bold text-slate-500">
                            <span>Subtotal</span>
                            <span className="font-black text-slate-900">
                              {formatCurrency(totalRecharge, currentUser)}
                            </span>
                          </div>

                          <div className="flex justify-between text-sm font-bold text-slate-500">
                            <span>Gross</span>
                            <span className="font-black text-slate-900">
                              {formatCurrency(
                                totalRecharge *
                                  (currentUser?.isVatRegistered ? 1 + ((currentUser.taxRate || 20) / 100) : 1),
                                currentUser
                              )}
                            </span>
                          </div>

                          {showPreview === "invoice" && (
                            <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-bold">
                              Terms: Payment upon receipt of invoice.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* PAYMENT / BANK DETAILS */}
                    <div className="mt-10 p-4 rounded-2xl border border-slate-200 bg-slate-50">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                        Payment Details
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Account Name</div>
                          <div className="font-black text-slate-900">{bankAccountName || "—"}</div>
                        </div>

                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Account Number</div>
                          <div className="font-black text-slate-900">{bankAccountNumber || "—"}</div>
                        </div>

                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Sort Code / IBAN
                          </div>
                          <div className="font-black text-slate-900">{bankSortOrIban || "—"}</div>
                        </div>
                      </div>

                      {!bankAccountName && !bankAccountNumber && !bankSortOrIban && (
                        <div className="mt-3 text-[10px] text-slate-400 font-bold">
                          Add your bank details in Settings to show them here automatically.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="border-t border-slate-100 px-6 py-4 flex gap-3 justify-end bg-white">
                <button
                  type="button"
                  onClick={() => setShowPreview(null)}
                  className="px-5 py-3 bg-slate-50 text-slate-500 rounded-2xl font-black text-[10px] uppercase border border-slate-200"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={isSaving}
                  className="px-5 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center gap-2"
                >
                  {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-print"></i>}
                  {isSaving ? "Preparing..." : "Print / Download"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Invoice Date Modal */}
      {showEditInvoiceDateModal && invoice && client && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Edit Invoice Date</h3>
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
              </div>

              <div className="text-[10px] text-slate-500 font-bold">
                Due date will update automatically using client terms ({client.paymentTermsDays || 30} days).
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditInvoiceDateModal(false)}
                  className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase border border-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmEditInvoiceDate}
                  disabled={isSaving || !editInvoiceDate}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-2"
                >
                  {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-calendar-check"></i>}
                  {isSaving ? "Saving..." : "Save Date"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Mark Unpaid Modal */}
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

              {/* ✅ You had the modal but no button to open it */}
              <button
                type="button"
                onClick={() => setShowEditInvoiceDateModal(true)}
                disabled={isSaving || invoice.status === InvoiceStatus.PAID}
                className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase shadow-sm"
                title={invoice.status === InvoiceStatus.PAID ? "Cannot edit a paid invoice" : "Edit invoice date"}
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
                      setJob((prev) =>
                        prev ? { ...prev, schedulingType: SchedulingType.CONTINUOUS, syncToCalendar: true } : prev
                      )
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
                      setJob((prev) =>
                        prev ? { ...prev, schedulingType: SchedulingType.SHIFT_BASED, syncToCalendar: true } : prev
                      )
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
                  {(shifts || []).map((s, idx) => {
                    const isFullDay = (s as any).isFullDay !== false;

                    return (
                      <div
                        key={s.id}
                        className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col gap-3"
                      >
                        <div className="flex flex-col md:flex-row gap-3 items-center">
                          <input
                            className="bg-white px-4 py-2 rounded-xl text-xs font-black w-full md:flex-1"
                            placeholder="Shift Title"
                            value={(s as any).title || ""}
                            onChange={(e) => {
                              const n = [...shifts];
                              (n[idx] as any).title = e.target.value;
                              setShifts(n);
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => setShifts((prev) => (prev || []).filter((_, i) => i !== idx))}
                            className="text-slate-300 hover:text-rose-500"
                            title="Remove shift"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase px-1">Start Date</label>
                            <input
                              type="date"
                              value={(s as any).startDate || ""}
                              className="bg-white px-4 py-2 rounded-xl text-xs font-bold w-full"
                              onChange={(e) => {
                                const n = [...shifts];
                                (n[idx] as any).startDate = e.target.value;
                                if (!(n[idx] as any).endDate) (n[idx] as any).endDate = e.target.value;
                                setShifts(n);
                              }}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase px-1">End Date</label>
                            <input
                              type="date"
                              value={(s as any).endDate || ""}
                              className="bg-white px-4 py-2 rounded-xl text-xs font-bold w-full"
                              onChange={(e) => {
                                const n = [...shifts];
                                (n[idx] as any).endDate = e.target.value;
                                setShifts(n);
                              }}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase px-1">Full Day</label>
                            <button
                              type="button"
                              onClick={() => {
                                const n = [...shifts];
                                const cur = (n[idx] as any).isFullDay;
                                const nextIsFullDay = cur === false ? true : false;
                                (n[idx] as any).isFullDay = nextIsFullDay;

                                if (!(n[idx] as any).startTime) (n[idx] as any).startTime = "09:00";
                                if (!(n[idx] as any).endTime) (n[idx] as any).endTime = "17:30";

                                setShifts(n);
                              }}
                              className={`w-full px-4 py-2 rounded-xl text-[10px] font-black uppercase border ${
                                isFullDay
                                  ? "bg-white text-indigo-600 border-indigo-200"
                                  : "bg-white text-slate-500 border-slate-200"
                              }`}
                            >
                              {isFullDay ? "Yes" : "No (Timed)"}
                            </button>
                          </div>

                          {!isFullDay ? (
                            <div className="md:col-span-1">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase px-1">Start</label>
                                  <input
                                    type="time"
                                    value={(s as any).startTime || "09:00"}
                                    className="bg-white px-4 py-2.5 rounded-xl text-sm font-black w-full min-w-[130px] md:min-w-[150px] border border-slate-200"
                                    onChange={(e) => {
                                      const n = [...shifts];
                                      (n[idx] as any).startTime = e.target.value;
                                      setShifts(n);
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black text-slate-400 uppercase px-1">End</label>
                                  <input
                                    type="time"
                                    value={(s as any).endTime || "17:30"}
                                    className="bg-white px-4 py-2.5 rounded-xl text-sm font-black w-full min-w-[130px] md:min-w-[150px] border border-slate-200"
                                    onChange={(e) => {
                                      const n = [...shifts];
                                      (n[idx] as any).endTime = e.target.value;
                                      setShifts(n);
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-end">
                              <div className="text-[10px] text-slate-400 font-bold px-1">
                                Timed fields hidden for full-day shifts.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

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
                        } as any,
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
                    Synchronization disabled. Job will be removed from external calendar on save.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Deliverables Section */}
          <div className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black uppercase tracking-widest italic">Entries & Deliverables</h4>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-[10px] font-black text-indigo-600 uppercase hover:underline"
              >
                + Add Entry
              </button>
            </div>

            <div className="space-y-3">
              {(items || []).map((item, idx) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-3 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100 group"
                >
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
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-slate-300 hover:text-rose-500 transition-colors"
                    >
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
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest italic mb-2">
              Project Valuation
            </p>
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
              <p className="text-[10px] text-slate-400 leading-relaxed italic whitespace-pre-wrap">{client?.address}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};