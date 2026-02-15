// src/pages/Mileage.tsx
import React, { useState, useMemo, useEffect, useRef } from "react";
import type { AppState, MileageRecord, Job } from "../types";
import { DB, generateId } from "../services/db";
import { formatCurrency } from "../utils";
import { getDrivingDistanceFromGoogleMaps } from "../lib/googleMaps";
import { parseISO, format, isValid } from "date-fns";

interface MileageProps {
  state: AppState;
  onRefresh: () => void;
}

const MILEAGE_RATE = 0.45; // HMRC £0.45/mile

// ---------- Date formatting helpers ----------
function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function safeParse(dateStr?: string) {
  if (!dateStr) return null;
  const d = parseISO(dateStr);
  return isValid(d) ? d : null;
}

function formatRangePretty(startStr?: string, endStr?: string) {
  const s = safeParse(startStr);
  if (!s) return "-";
  const e = safeParse(endStr);

  const sDay = Number(format(s, "d"));
  const sMon = format(s, "MMM");
  const sYY = format(s, "yy");
  const sMonthKey = format(s, "yyyy-MM");

  if (!e) return `${ordinal(sDay)} ${sMon} ${sYY}`;

  const eDay = Number(format(e, "d"));
  const eMon = format(e, "MMM");
  const eYY = format(e, "yy");
  const eMonthKey = format(e, "yyyy-MM");

  if (sMonthKey === eMonthKey) {
    return `${ordinal(sDay)} - ${ordinal(eDay)} ${eMon} ${eYY}`;
  }
  return `${ordinal(sDay)} ${sMon} ${sYY} - ${ordinal(eDay)} ${eMon} ${eYY}`;
}

// ---------- Job helpers ----------
function jobTitle(job: any) {
  return (
    job?.title ||
    job?.name ||
    job?.jobName ||
    job?.description ||
    job?.reference ||
    "Job"
  );
}

function pickDatesFromJob(job: any) {
  const start =
    job?.startDate ||
    job?.dateStart ||
    job?.jobStartDate ||
    job?.date ||
    "";

  const end = job?.endDate || job?.dateEnd || job?.jobEndDate || "";

  const norm = (d: any) => (typeof d === "string" ? d.split("T")[0] : "");
  return { date: norm(start), endDate: norm(end) };
}

function pickStartEndFromJob(job: any) {
  const start =
    job?.startPostcode || job?.fromPostcode || job?.originPostcode || "";
  const end =
    job?.endPostcode || job?.toPostcode || job?.destinationPostcode || "";
  return { start: String(start || ""), end: String(end || "") };
}

function buildJobLabel(job: Job) {
  const { date, endDate } = pickDatesFromJob(job);
  const range = formatRangePretty(date, endDate);
  return `${job.id} — ${jobTitle(job)} — ${range}`;
}

function asNumber(v: any, fallback = 0) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}
function asInt(v: any, fallback = 1) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}
function asBool(v: any) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return !!v;
}

const Mileage: React.FC<MileageProps> = ({ state, onRefresh }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const lastCalculatedRef = useRef("");

  const [editingId, setEditingId] = useState<string | null>(null);

  // ✅ NEW: validation message shown above submit
  const [formError, setFormError] = useState<string | null>(null);

  const jobs = state?.jobs || [];

  const jobOptions = useMemo(() => {
    return jobs
      .slice()
      .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))
      .map((j: Job) => ({
        id: String(j.id),
        label: buildJobLabel(j),
        job: j,
      }));
  }, [jobs]);

  const blankEntry = {
    date: new Date().toISOString().split("T")[0],
    endDate: "", // ✅ mandatory now, keep blank and validate
    startPostcode: "",
    endPostcode: "",
    numTrips: 1,
    isReturn: true,
    distanceMiles: 0,
    jobId: "",
    clientId: "",
    description: "",
  };

  const [newEntry, setNewEntry] = useState(blankEntry);

  // ✅ NEW: centralised validation
  const validateEntry = () => {
    const date = (newEntry.date || "").trim();
    const endDate = (newEntry.endDate || "").trim();
    const start = (newEntry.startPostcode || "").trim();
    const end = (newEntry.endPostcode || "").trim();

    if (!date) return "Start date is required.";
    if (!endDate) return "End date is required.";
    if (endDate < date) return "End date cannot be earlier than start date.";
    if (!start || start.length < 5) return "Start postcode is required.";
    if (!end || end.length < 5) return "End postcode is required.";

    // Distance is optional to type manually, but must be > 0 to save
    const miles = asNumber(newEntry.distanceMiles, 0);
    if (!Number.isFinite(miles) || miles <= 0) return "Miles must be greater than 0.";

    return null;
  };

  const entryTripMiles = useMemo(() => {
    const miles = asNumber(newEntry.distanceMiles, 0);
    const trips = Math.max(1, asInt(newEntry.numTrips, 1));
    const ret = asBool(newEntry.isReturn);
    return miles * trips * (ret ? 2 : 1);
  }, [newEntry.distanceMiles, newEntry.numTrips, newEntry.isReturn]);

  useEffect(() => {
    // clear error as the user edits
    if (formError) setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newEntry.date, newEntry.endDate, newEntry.startPostcode, newEntry.endPostcode, newEntry.distanceMiles]);

  useEffect(() => {
    const start = newEntry.startPostcode.trim();
    const end = newEntry.endPostcode.trim();

    if (start.length >= 5 && end.length >= 5) {
      const key = `${start}-${end}`;
      if (key !== lastCalculatedRef.current) {
        const timer = setTimeout(() => {
          handleCalculateMileage();
        }, 900);
        return () => clearTimeout(timer);
      }
    }
  }, [newEntry.startPostcode, newEntry.endPostcode]); // eslint-disable-line

  const handleSelectJob = (jobId: string) => {
    const opt = jobOptions.find((o) => o.id === jobId);

    if (!opt) {
      setNewEntry((prev) => ({ ...prev, jobId: "", clientId: "" }));
      return;
    }

    const { date, endDate } = pickDatesFromJob(opt.job);
    const { start, end } = pickStartEndFromJob(opt.job);
    const autoDesc = `${opt.job.id} — ${jobTitle(opt.job)}`.trim();

    setNewEntry((prev) => ({
      ...prev,
      jobId: opt.id,
      clientId: opt.job.clientId || "",
      date: date || prev.date,
      endDate: endDate || prev.endDate,
      description: autoDesc,
      startPostcode: start ? String(start).toUpperCase() : prev.startPostcode,
      endPostcode: end ? String(end).toUpperCase() : prev.endPostcode,
    }));

    lastCalculatedRef.current = "";
  };

  const handleCalculateMileage = async () => {
    const start = newEntry.startPostcode.trim();
    const end = newEntry.endPostcode.trim();
    if (!start || !end) return;

    setIsCalculating(true);
    lastCalculatedRef.current = `${start}-${end}`;

    try {
      // ✅ UK-scope the query to avoid geocoding to the wrong country/region
      const startUK = `${start}, UK`;
      const endUK = `${end}, UK`;

      const result = await getDrivingDistanceFromGoogleMaps(startUK, endUK);

      if (result.miles !== null && result.miles > 0) {
        setNewEntry((prev) => ({ ...prev, distanceMiles: result.miles || 0 }));
      } else {
        console.warn("Distance lookup returned no miles:", result);
      }
    } catch (err) {
      console.warn("Distance lookup failed:", err);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleStartAmend = (record: MileageRecord) => {
    setEditingId(record.id);

    setNewEntry({
      date: (record.date || "").split("T")[0],
      endDate: record.endDate ? String(record.endDate).split("T")[0] : "",
      startPostcode: String(record.startPostcode || "").toUpperCase(),
      endPostcode: String(record.endPostcode || "").toUpperCase(),
      numTrips: asInt((record as any).numTrips, 1),
      isReturn: asBool((record as any).isReturn),
      distanceMiles: asNumber((record as any).distanceMiles, 0),
      jobId: record.jobId || "",
      clientId: record.clientId || "",
      description: record.description || "",
    });

    setFormError(null);
    lastCalculatedRef.current = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelAmend = () => {
    setEditingId(null);
    setNewEntry(blankEntry);
    setFormError(null);
    lastCalculatedRef.current = "";
  };

  const canSubmit = useMemo(() => {
    if (isSaving || isCalculating) return false;
    return validateEntry() === null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaving, isCalculating, newEntry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const err = validateEntry();
    if (err) {
      setFormError(err);
      return;
    }

    if (isSaving) return;

    setIsSaving(true);
    setFormError(null);

    try {
      const tenantId = state.user?.email || "";

      const record: MileageRecord = {
        id: editingId ?? generateId(),
        ...newEntry,
        numTrips: Math.max(1, asInt(newEntry.numTrips, 1)),
        isReturn: asBool(newEntry.isReturn),
        distanceMiles: asNumber(newEntry.distanceMiles, 0),
        tenant_id: tenantId,
      } as any;

      await DB.saveMileage(record);

      setEditingId(null);
      setNewEntry(blankEntry);
      lastCalculatedRef.current = "";
      onRefresh();
    } catch (err2: any) {
      // keep the form as-is so user can fix and retry
      setFormError("Failed to save to cloud. Please check required fields and try again.");
      console.warn("Mileage save failed:", err2);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Remove this entry from the ledger?")) {
      await DB.deleteMileage(id);
      onRefresh();
    }
  };

  const totals = useMemo(() => {
    return (state.mileage || []).reduce(
      (acc, curr: any) => {
        const miles = asNumber(curr.distanceMiles, 0);
        const trips = Math.max(1, asInt(curr.numTrips, 1));
        const ret = asBool(curr.isReturn);

        const tripDistance = miles * trips * (ret ? 2 : 1);

        return {
          miles: acc.miles + tripDistance,
          value: acc.value + tripDistance * MILEAGE_RATE,
        };
      },
      { miles: 0, value: 0 }
    );
  }, [state.mileage]);

  const recordsSorted = useMemo(() => {
    return (state.mileage || [])
      .slice()
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.mileage]);

  return (
    <div className="space-y-6 px-4 pb-24 md:pb-6">
      <header>
        <h2 className="text-3xl font-black text-slate-900 leading-tight italic">
          Travel &amp; Mileage
        </h2>
        <p className="text-slate-500 font-bold uppercase text-[9px] tracking-widest italic">
          Distance via Secure Edge Function
        </p>
      </header>

      {/* LINK TO JOB */}
      <div className="bg-white p-6 rounded-[40px] border border-slate-200 shadow-sm">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
            Link to Job (optional)
          </label>
          <select
            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
            value={newEntry.jobId}
            onChange={(e) => handleSelectJob(e.target.value)}
          >
            <option value="">— No job selected —</option>
            {jobOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="text-[10px] font-bold text-slate-400 px-1">
            Selecting a job auto-fills <span className="font-black">Project ID + Job Description</span> and dates.
          </div>
        </div>
      </div>

      {/* ENTRY FORM */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
                Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                value={newEntry.date}
                onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
                End Date (Range) <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                value={newEntry.endDate}
                onChange={(e) => setNewEntry({ ...newEntry, endDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
                Description (Project ID + Job)
              </label>
              <input
                placeholder="e.g. 250461 — AWS London"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none"
                value={newEntry.description}
                onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <div className="md:col-span-3 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
                Start Postcode <span className="text-rose-500">*</span>
              </label>
              <input
                placeholder="SW1..."
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase"
                value={newEntry.startPostcode}
                onChange={(e) =>
                  setNewEntry({ ...newEntry, startPostcode: e.target.value.toUpperCase() })
                }
              />
            </div>

            <div className="md:col-span-3 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
                End Postcode <span className="text-rose-500">*</span>
              </label>
              <input
                placeholder="E1..."
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase"
                value={newEntry.endPostcode}
                onChange={(e) =>
                  setNewEntry({ ...newEntry, endPostcode: e.target.value.toUpperCase() })
                }
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
                Miles (one-way) <span className="text-rose-500">*</span>
              </label>
              <div
                className={`relative px-4 py-4 bg-indigo-50 border rounded-2xl flex items-center justify-between font-black text-sm h-[56px] transition-all ${
                  isCalculating
                    ? "border-indigo-400 animate-pulse"
                    : "border-indigo-100 text-indigo-700"
                }`}
              >
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-transparent outline-none font-black text-indigo-700 placeholder:text-indigo-300"
                  value={newEntry.distanceMiles || ""}
                  placeholder={isCalculating ? "GEO..." : "0.00"}
                  onChange={(e) =>
                    setNewEntry({
                      ...newEntry,
                      distanceMiles: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <button
                  type="button"
                  onClick={handleCalculateMileage}
                  className="text-indigo-400 hover:text-indigo-600 ml-1"
                  title="Recalculate"
                >
                  <i className="fa-solid fa-arrows-rotate text-[10px]"></i>
                </button>
              </div>
            </div>

            <div className="md:col-span-1 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
                Trips
              </label>
              <input
                type="number"
                min="1"
                className="w-full px-4 py-4 bg-white border border-slate-200 rounded-2xl font-black outline-none h-[56px] text-center"
                value={newEntry.numTrips}
                onChange={(e) =>
                  setNewEntry({
                    ...newEntry,
                    numTrips: Math.max(1, parseInt(e.target.value) || 1),
                  })
                }
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">
                Return?
              </label>
              <button
                type="button"
                onClick={() => setNewEntry({ ...newEntry, isReturn: !newEntry.isReturn })}
                className={`w-full px-2 py-4 rounded-2xl font-black text-[10px] uppercase border transition-all h-[56px] ${
                  newEntry.isReturn
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-400 border-slate-200"
                }`}
              >
                {newEntry.isReturn ? "Yes" : "No"}
              </button>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="md:col-span-1 h-[56px] bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
              title={!canSubmit ? "Please complete required fields" : "Save mileage entry"}
            >
              {isSaving ? (
                <i className="fa-solid fa-spinner animate-spin"></i>
              ) : editingId ? (
                "Update"
              ) : (
                "Add"
              )}
            </button>
          </div>

          {/* ✅ NEW: validation message */}
          {formError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-[11px] font-black text-rose-600">
              {formError}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between pt-2">
            <div className="text-[11px] font-bold text-slate-500">
              This entry total:
              <span className="font-black text-slate-900 ml-2">
                {entryTripMiles.toFixed(1)} mi
              </span>
              <span className="ml-3 text-indigo-600 font-black">
                {formatCurrency(entryTripMiles * MILEAGE_RATE, state.user)}
              </span>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={handleCancelAmend}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 w-fit"
              >
                Cancel amend
              </button>
            )}
          </div>
        </form>
      </div>

      {/* TOTALS */}
      <div className="flex flex-col md:flex-row justify-end gap-4">
        <div className="bg-white border border-slate-200 p-6 rounded-[32px] shadow-sm flex items-center gap-8 w-full md:w-auto">
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Fiscal Total
            </p>
            <p className="text-2xl font-black text-slate-900">
              {totals.miles.toFixed(1)}{" "}
              <span className="text-[10px] text-slate-400">mi</span>
            </p>
          </div>
          <div className="w-px h-10 bg-slate-100"></div>
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Reclaim Val
            </p>
            <p className="text-2xl font-black text-indigo-600">
              {formatCurrency(totals.value, state.user)}
            </p>
          </div>
        </div>
      </div>

      {/* RECORDS */}
      <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="hidden md:block">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-5 w-[210px]">Date</th>
                <th className="p-5">Description</th>
                <th className="p-5 w-[220px]">Route</th>
                <th className="p-5 w-[140px]">Leg</th>
                <th className="p-5 text-right w-[110px]">Total mi</th>
                <th className="p-5 text-right w-[120px]">Valuation</th>
                <th className="p-5 text-center w-[170px]">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-medium">
              {recordsSorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest italic"
                  >
                    Operational travel ledger is empty
                  </td>
                </tr>
              ) : (
                recordsSorted.map((record: any) => {
                  const miles = asNumber(record.distanceMiles, 0);
                  const trips = Math.max(1, asInt(record.numTrips, 1));
                  const ret = asBool(record.isReturn);
                  const totalTripMiles = miles * trips * (ret ? 2 : 1);
                  const dateLabel = formatRangePretty(record.date, record.endDate);

                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-5 text-[12px] font-black text-slate-900 whitespace-nowrap">
                        {dateLabel}
                      </td>
                      <td className="p-5 text-[12px] font-bold text-slate-700">
                        {record.description || "Travel"}
                      </td>
                      <td className="p-5 text-[11px] font-black text-slate-700 whitespace-nowrap">
                        {record.startPostcode}{" "}
                        <i className="fa-solid fa-arrow-right-long mx-2 text-indigo-400"></i>{" "}
                        {record.endPostcode}
                      </td>
                      <td className="p-5">
                        <span
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap ${
                            ret
                              ? "bg-indigo-50 text-indigo-600 border-indigo-100"
                              : "bg-slate-50 text-slate-400 border-slate-100"
                          }`}
                        >
                          {ret ? "Return" : "Single"}
                          {trips > 1 ? ` x${trips}` : ""}
                        </span>
                      </td>
                      <td className="p-5 text-right font-black text-slate-900">
                        {totalTripMiles.toFixed(1)}
                      </td>
                      <td className="p-5 text-right font-black text-indigo-600">
                        {formatCurrency(totalTripMiles * MILEAGE_RATE, state.user)}
                      </td>
                      <td className="p-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartAmend(record)}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50"
                          >
                            Amend
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(record.id)}
                            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                            title="Delete"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-slate-100">
          {recordsSorted.length === 0 ? (
            <div className="p-16 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest italic">
              Operational travel ledger is empty
            </div>
          ) : (
            recordsSorted.map((record: any) => {
              const miles = asNumber(record.distanceMiles, 0);
              const trips = Math.max(1, asInt(record.numTrips, 1));
              const ret = asBool(record.isReturn);
              const totalTripMiles = miles * trips * (ret ? 2 : 1);

              return (
                <div key={record.id} className="p-5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-black text-slate-900">
                        {formatRangePretty(record.date, record.endDate)}
                      </div>
                      <div className="text-[12px] font-bold text-slate-700">
                        {record.description || "Travel"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[12px] font-black text-slate-900">
                        {totalTripMiles.toFixed(1)} mi
                      </div>
                      <div className="text-[12px] font-black text-indigo-600">
                        {formatCurrency(totalTripMiles * MILEAGE_RATE, state.user)}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] font-black text-slate-700 whitespace-nowrap">
                    {record.startPostcode}{" "}
                    <i className="fa-solid fa-arrow-right-long mx-2 text-indigo-400"></i>{" "}
                    {record.endPostcode}
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap ${
                        ret
                          ? "bg-indigo-50 text-indigo-600 border-indigo-100"
                          : "bg-slate-50 text-slate-400 border-slate-100"
                      }`}
                    >
                      {ret ? "Return" : "Single"}
                      {trips > 1 ? ` x${trips}` : ""}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartAmend(record)}
                        className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50"
                      >
                        Amend
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                        title="Delete"
                      >
                        <i className="fa-solid fa-trash-can text-xs"></i>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Mileage;
