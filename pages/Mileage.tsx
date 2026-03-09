// src/pages/Mileage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Job, MileageRecord } from "../types";
import { DB, generateId } from "../services/db";
import { formatCurrency } from "../utils";
import { getDrivingDistanceFromGoogleMaps } from "../lib/googleMaps";
import { format, isValid, parseISO } from "date-fns";

interface MileageProps {
  state: AppState;
  onRefresh: () => void;
}

const MILEAGE_RATE = 0.45; // HMRC £0.45/mile

function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function formatDisplayDate(dateStr?: string) {
  if (!dateStr) return "No date";
  try {
    const parsed = parseISO(dateStr);
    if (!isValid(parsed)) return dateStr;
    return format(parsed, `do MMM yy`).replace(
      /\b(\d+)(st|nd|rd|th)\b/,
      (_, d, suffix) => `${d}${suffix}`
    );
  } catch {
    return dateStr;
  }
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return "No date";
  if (start && !end) return formatDisplayDate(start);
  if (!start && end) return formatDisplayDate(end);

  try {
    const s = parseISO(start as string);
    const e = parseISO(end as string);

    if (!isValid(s) || !isValid(e)) {
      return `${start ?? ""}${end ? ` - ${end}` : ""}`;
    }

    const sameDay = format(s, "yyyy-MM-dd") === format(e, "yyyy-MM-dd");
    if (sameDay) return format(s, `do MMM yy`);

    const sameMonth = format(s, "MMM yy") === format(e, "MMM yy");
    if (sameMonth) {
      return `${ordinal(Number(format(s, "d")))} - ${ordinal(
        Number(format(e, "d"))
      )} ${format(e, "MMM yy")}`;
    }

    return `${format(s, `do MMM yy`)} - ${format(e, `do MMM yy`)}`;
  } catch {
    return `${start ?? ""}${end ? ` - ${end}` : ""}`;
  }
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normaliseText(value: unknown) {
  return String(value ?? "").trim();
}

function getJobLabel(job?: Partial<Job> | null) {
  if (!job) return "";
  return (
    normaliseText((job as any).jobNumber) ||
    normaliseText((job as any).quoteNumber) ||
    normaliseText((job as any).id)
  );
}

function getJobName(job?: Partial<Job> | null) {
  if (!job) return "";
  return (
    normaliseText((job as any).title) ||
    normaliseText((job as any).name) ||
    normaliseText((job as any).client) ||
    ""
  );
}

export const Mileage: React.FC<MileageProps> = ({ state, onRefresh }) => {
  const jobs = useMemo<Job[]>(() => state.jobs ?? [], [state.jobs]);
  const mileageRecords = useMemo<MileageRecord[]>(
    () => state.mileageRecords ?? [],
    [state.mileageRecords]
  );

  const [selectedJobId, setSelectedJobId] = useState("");
  const [date, setDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [isReturn, setIsReturn] = useState(true);
  const [manualMiles, setManualMiles] = useState("");
  const [useManualMiles, setUseManualMiles] = useState(false);

  const [filterText, setFilterText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [loadingDistance, setLoadingDistance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement | null>(null);

  const selectedJob = useMemo(
    () => jobs.find((j) => String((j as any).id) === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  useEffect(() => {
    if (!selectedJob || editingId) return;

    const jobStart =
      normaliseText((selectedJob as any).startDate) ||
      normaliseText((selectedJob as any).date);
    const jobEnd =
      normaliseText((selectedJob as any).endDate) ||
      normaliseText((selectedJob as any).startDate) ||
      normaliseText((selectedJob as any).date);

    if (jobStart && !startDate) setStartDate(jobStart);
    if (jobEnd && !endDate) setEndDate(jobEnd);

    const base =
      normaliseText((selectedJob as any).venue) ||
      normaliseText((selectedJob as any).location) ||
      normaliseText((selectedJob as any).siteAddress) ||
      normaliseText((selectedJob as any).address);

    if (base && !toLocation) setToLocation(base);
  }, [selectedJob, editingId, startDate, endDate, toLocation]);

  const sortedRecords = useMemo(() => {
    return [...mileageRecords].sort((a, b) => {
      const aDate = normaliseText((a as any).startDate || a.date);
      const bDate = normaliseText((b as any).startDate || b.date);
      return bDate.localeCompare(aDate);
    });
  }, [mileageRecords]);

  const filteredMileage = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return sortedRecords;

    return sortedRecords.filter((record) => {
      const linkedJob =
        jobs.find((j) => String((j as any).id) === String((record as any).jobId)) ??
        null;

      const haystack = [
        normaliseText((record as any).fromLocation),
        normaliseText((record as any).toLocation),
        normaliseText((record as any).notes),
        normaliseText((record as any).jobName),
        normaliseText((record as any).jobNumber),
        getJobLabel(linkedJob),
        getJobName(linkedJob),
        normaliseText((record as any).date),
        normaliseText((record as any).startDate),
        normaliseText((record as any).endDate),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [filterText, sortedRecords, jobs]);

  const totalMiles = useMemo(
    () => filteredMileage.reduce((sum, r) => sum + safeNumber((r as any).miles), 0),
    [filteredMileage]
  );

  const totalAmount = useMemo(
    () => filteredMileage.reduce((sum, r) => sum + safeNumber((r as any).amount), 0),
    [filteredMileage]
  );

  async function calculateMiles() {
    setError(null);

    if (useManualMiles) {
      const miles = safeNumber(manualMiles, 0);
      if (miles <= 0) {
        setError("Please enter a valid mileage amount.");
        return 0;
      }
      return miles;
    }

    if (!fromLocation.trim() || !toLocation.trim()) {
      setError("Please enter both a start and destination location.");
      return 0;
    }

    try {
      setLoadingDistance(true);
      const result = await getDrivingDistanceFromGoogleMaps(
        fromLocation.trim(),
        toLocation.trim()
      );

      const oneWayMiles =
        safeNumber((result as any)?.miles) ||
        safeNumber((result as any)?.distanceMiles) ||
        safeNumber((result as any)?.distance) ||
        0;

      if (!oneWayMiles || oneWayMiles <= 0) {
        setError("Could not calculate mileage for this journey.");
        return 0;
      }

      return isReturn ? oneWayMiles * 2 : oneWayMiles;
    } catch (err) {
      console.error("Mileage calculation failed:", err);
      setError("Unable to calculate distance right now.");
      return 0;
    } finally {
      setLoadingDistance(false);
    }
  }

  function resetForm() {
    setSelectedJobId("");
    setDate("");
    setStartDate("");
    setEndDate("");
    setFromLocation("");
    setToLocation("");
    setNotes("");
    setIsReturn(true);
    setManualMiles("");
    setUseManualMiles(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const miles = await calculateMiles();
      if (!miles || miles <= 0) {
        setSaving(false);
        return;
      }

      const amount = Number((miles * MILEAGE_RATE).toFixed(2));

      const linkedJob =
        jobs.find((j) => String((j as any).id) === selectedJobId) ?? null;

      const payload: MileageRecord = {
        ...(editingId
          ? (mileageRecords.find((r) => String((r as any).id) === editingId) as MileageRecord)
          : ({} as MileageRecord)),
        id: editingId ?? generateId(),
        jobId: selectedJobId || undefined,
        date: date || startDate || endDate || "",
        startDate: startDate || date || "",
        endDate: endDate || startDate || date || "",
        fromLocation: fromLocation.trim(),
        toLocation: toLocation.trim(),
        notes: notes.trim(),
        isReturn,
        miles,
        amount,
        jobNumber:
          normaliseText((linkedJob as any)?.jobNumber) ||
          normaliseText((linkedJob as any)?.quoteNumber) ||
          "",
        jobName:
          normaliseText((linkedJob as any)?.title) ||
          normaliseText((linkedJob as any)?.name) ||
          normaliseText((linkedJob as any)?.client) ||
          "",
        mileageRate: MILEAGE_RATE,
        createdAt:
          (editingId
            ? (mileageRecords.find((r) => String((r as any).id) === editingId) as any)?.createdAt
            : new Date().toISOString()) ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingId) {
        await DB.mileage.update(payload);
      } else {
        await DB.mileage.create(payload);
      }

      resetForm();
      onRefresh();
    } catch (err) {
      console.error(err);
      setError("Unable to save mileage entry.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(record: MileageRecord) {
    setEditingId(String((record as any).id));
    setSelectedJobId(normaliseText((record as any).jobId));
    setDate(normaliseText((record as any).date));
    setStartDate(normaliseText((record as any).startDate || (record as any).date));
    setEndDate(
      normaliseText((record as any).endDate || (record as any).startDate || (record as any).date)
    );
    setFromLocation(normaliseText((record as any).fromLocation));
    setToLocation(normaliseText((record as any).toLocation));
    setNotes(normaliseText((record as any).notes));
    setIsReturn(Boolean((record as any).isReturn));
    setManualMiles(String(safeNumber((record as any).miles)));
    setUseManualMiles(true);
    setError(null);

    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("Delete this mileage entry?");
    if (!ok) return;

    try {
      await DB.mileage.delete(id);
      if (editingId === id) resetForm();
      onRefresh();
    } catch (err) {
      console.error(err);
      setError("Unable to delete mileage entry.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mileage</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track journeys, claim mileage, and edit entries without the action
              buttons disappearing off-screen.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Entries
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {filteredMileage.length}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Miles
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {totalMiles.toFixed(1)}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 col-span-2 sm:col-span-1">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Value
              </div>
              <div className="mt-1 text-xl font-bold text-indigo-600">
                {formatCurrency(totalAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div
        ref={formRef}
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">
            {editingId ? "Edit mileage entry" : "Add mileage entry"}
          </h2>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel edit
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Link to job
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
              >
                <option value="">No linked job</option>
                {jobs.map((job) => {
                  const jobId = String((job as any).id);
                  const label = getJobLabel(job);
                  const name = getJobName(job);
                  return (
                    <option key={jobId} value={jobId}>
                      {[label, name].filter(Boolean).join(" — ") || jobId}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  End date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                From
              </label>
              <input
                type="text"
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value)}
                placeholder="e.g. WV3 8DA"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                To
              </label>
              <input
                type="text"
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                placeholder="e.g. Manchester Airport"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[auto_1fr_auto] xl:items-end">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <input
                type="checkbox"
                checked={isReturn}
                onChange={(e) => setIsReturn(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-slate-700">
                Return journey
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <input
                type="checkbox"
                checked={useManualMiles}
                onChange={(e) => setUseManualMiles(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-slate-700">
                Enter miles manually
              </span>
            </label>

            {useManualMiles && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Miles
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualMiles}
                  onChange={(e) => setManualMiles(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving || loadingDistance}
              className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingId
                ? "Update mileage entry"
                : "Save mileage entry"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </form>
      </div>

      {/* Search */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-xl font-bold text-slate-900">Mileage entries</h2>

          <div className="w-full lg:w-[360px]">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search by job, location, date..."
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-3 overflow-x-hidden">
        {filteredMileage.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 shadow-sm">
            No mileage entries found.
          </div>
        ) : (
          filteredMileage.map((record) => {
            const linkedJob =
              jobs.find((j) => String((j as any).id) === String((record as any).jobId)) ??
              null;

            const recordJobNumber =
              normaliseText((record as any).jobNumber) || getJobLabel(linkedJob);
            const recordJobName =
              normaliseText((record as any).jobName) || getJobName(linkedJob);

            const displayRange = formatDateRange(
              normaliseText((record as any).startDate || (record as any).date),
              normaliseText(
                (record as any).endDate ||
                  (record as any).startDate ||
                  (record as any).date
              )
            );

            const miles = safeNumber((record as any).miles);
            const amount = safeNumber((record as any).amount);

            return (
              <div
                key={String((record as any).id)}
                className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5"
              >
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.1fr_1.4fr_1.6fr_0.7fr_auto] 2xl:items-center">
                  {/* Date */}
                  <div className="min-w-0">
                    <div className="text-xl font-bold text-slate-900">
                      {displayRange}
                    </div>
                  </div>

                  {/* Job */}
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-slate-800">
                      {recordJobNumber || "No job number"}
                    </div>
                    <div className="truncate text-base text-slate-600">
                      {recordJobName || "No linked job"}
                    </div>
                  </div>

                  {/* Route */}
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 text-base font-semibold text-slate-700">
                      <span className="truncate">{normaliseText((record as any).fromLocation) || "—"}</span>
                      <span className="text-indigo-500">→</span>
                      <span className="truncate">{normaliseText((record as any).toLocation) || "—"}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                        {(record as any).isReturn ? "Return" : "One way"}
                      </span>

                      {normaliseText((record as any).notes) && (
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {normaliseText((record as any).notes)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Figures */}
                  <div className="text-left 2xl:text-right">
                    <div className="text-2xl font-bold text-slate-900">
                      {miles.toFixed(1)}
                    </div>
                    <div className="text-xl font-semibold text-indigo-600">
                      {formatCurrency(amount)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 2xl:justify-end">
                    <button
                      type="button"
                      onClick={() => handleEdit(record)}
                      className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(String((record as any).id))}
                      className="inline-flex items-center rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Mileage;