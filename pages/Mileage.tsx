import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppState, MileageRecord, JobItem } from '../types';
import { DB, generateId } from '../services/db';
import { formatDate, formatCurrency } from '../utils';
import { calculateDrivingDistance } from '../services/gemini';

interface MileageProps {
  state: AppState;
  onRefresh: () => void;
}

const MILEAGE_RATE = 0.45; // Standard HMRC rate £0.45/mile

export const Mileage: React.FC<MileageProps> = ({ state, onRefresh }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isBilling, setIsBilling] = useState<string | null>(null);

  // Change from boolean -> message (so we can see the REAL reason)
  const [calcError, setCalcError] = useState<string | null>(null);

  // Used to prevent repeated calls for the same route
  const lastCalculatedRef = useRef<string>('');
  const calcDebounceRef = useRef<number | null>(null);

  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    endDate: '',
    startPostcode: '',
    endPostcode: '',
    numTrips: 1,
    isReturn: true,
    distanceMiles: 0,
    jobId: '',
    clientId: '',
    description: ''
  });

  // Prepopulate dates when a Job is selected
  useEffect(() => {
    if (newEntry.jobId) {
      const selectedJob = state.jobs.find(j => j.id === newEntry.jobId);
      if (selectedJob) {
        setNewEntry(prev => ({
          ...prev,
          date: selectedJob.startDate,
          endDate: selectedJob.endDate,
          clientId: selectedJob.clientId,
          description: prev.description || `Travel for ${selectedJob.description}`
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newEntry.jobId, state.jobs]);

  const handleCalculateMileage = async (opts?: { force?: boolean }) => {
    const start = (newEntry.startPostcode || '').trim();
    const end = (newEntry.endPostcode || '').trim();

    // Basic validation
    if (!start || !end) {
      setCalcError('Enter both start and end locations.');
      return;
    }

    // Prevent spam / repeats
    const routeKey = `${start} -> ${end} | ${state.user?.country || ''}`;
    if (!opts?.force && routeKey === lastCalculatedRef.current) return;
    if (isCalculating) return;

    setIsCalculating(true);
    setCalcError(null);

    // record the route we’re attempting (so we don’t hammer the API)
    lastCalculatedRef.current = routeKey;

    try {
      // IMPORTANT: log so you can see clicks and failures in prod
      console.log('[Mileage] Calculating distance:', { start, end, country: state.user?.country });

      const result: any = await calculateDrivingDistance(start, end, state.user?.country);

      // Handle different shapes (in case service returns { miles, error } etc.)
      const miles =
        typeof result?.miles === 'number' ? result.miles :
        typeof result?.distanceMiles === 'number' ? result.distanceMiles :
        null;

      if (miles !== null && miles > 0) {
        setNewEntry(prev => ({ ...prev, distanceMiles: miles }));
        setCalcError(null);
      } else {
        const reason =
          result?.error ||
          result?.message ||
          'Lookup failed (no mileage returned). Check API key / billing / domain restrictions.';
        setCalcError(String(reason));
      }
    } catch (err: any) {
      console.warn('[Mileage] Map Protocol lookup failed:', err);
      const msg =
        err?.message ||
        err?.toString?.() ||
        'Lookup failed (unexpected error).';
      setCalcError(String(msg));
    } finally {
      setIsCalculating(false);
    }
  };

  // Auto-calc whenever route changes (debounced)
  useEffect(() => {
    const start = (newEntry.startPostcode || '').trim();
    const end = (newEntry.endPostcode || '').trim();

    // Reset mileage if the user clears a field
    if (!start || !end) {
      setCalcError(null);
      setNewEntry(prev => ({ ...prev, distanceMiles: 0 }));
      lastCalculatedRef.current = '';
      return;
    }

    // Debounce
    if (calcDebounceRef.current) window.clearTimeout(calcDebounceRef.current);
    calcDebounceRef.current = window.setTimeout(() => {
      handleCalculateMileage();
    }, 500);

    return () => {
      if (calcDebounceRef.current) window.clearTimeout(calcDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newEntry.startPostcode, newEntry.endPostcode, state.user?.country]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !newEntry.startPostcode || !newEntry.endPostcode) return;

    // Don’t allow saving if lookup failed (unless user manually entered miles)
    if ((newEntry.distanceMiles || 0) <= 0) {
      setCalcError('Distance is 0.00 — click refresh or enter miles manually.');
      return;
    }

    setIsSaving(true);
    try {
      const record: MileageRecord = {
        id: generateId(),
        ...newEntry,
        tenant_id: state.user?.email || ''
      };

      await DB.saveMileage(record);

      setNewEntry({
        date: new Date().toISOString().split('T')[0],
        endDate: '',
        startPostcode: '',
        endPostcode: '',
        numTrips: 1,
        isReturn: true,
        distanceMiles: 0,
        jobId: '',
        clientId: '',
        description: ''
      });

      lastCalculatedRef.current = '';
      setCalcError(null);
      onRefresh();
    } catch (err) {
      alert('Failed to sync record to cloud.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBillToProject = async (record: MileageRecord) => {
    if (!record.jobId) return;
    setIsBilling(record.id);

    try {
      const totalMiles = (record.distanceMiles || 0) * (record.numTrips || 1) * (record.isReturn ? 2 : 1);
      const totalCost = totalMiles * MILEAGE_RATE;

      const newItem: JobItem = {
        id: generateId(),
        jobId: record.jobId,
        description: `Mileage: ${record.startPostcode} to ${record.endPostcode} (${totalMiles.toFixed(1)} miles)`,
        qty: 1,
        unitPrice: totalCost,
        rechargeAmount: totalCost,
        actualCost: 0
      };

      const existingItems = await DB.getJobItems(record.jobId);
      await DB.saveJobItems(record.jobId, [...existingItems, newItem]);

      // Update Job total
      const job = state.jobs.find(j => j.id === record.jobId);
      if (job) {
        await DB.saveJob({
          ...job,
          totalRecharge: (job.totalRecharge || 0) + totalCost
        });
      }

      alert('Mileage successfully added as a line item to the project workspace.');
      onRefresh();
    } catch (err) {
      alert('Billing protocol failed.');
    } finally {
      setIsBilling(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Remove this entry from the ledger?')) {
      await DB.deleteMileage(id);
      onRefresh();
    }
  };

  const totals = useMemo(() => {
    return state.mileage.reduce(
      (acc, curr) => {
        const tripDistance = (curr.distanceMiles || 0) * (curr.numTrips || 1) * (curr.isReturn ? 2 : 1);
        return {
          miles: acc.miles + tripDistance,
          value: acc.value + tripDistance * MILEAGE_RATE
        };
      },
      { miles: 0, value: 0 }
    );
  }, [state.mileage]);

  return (
    <div className="space-y-6 px-4">
      <header>
        <h2 className="text-3xl font-black text-slate-900 leading-tight italic">Travel &amp; Mileage</h2>
        <p className="text-slate-500 font-bold uppercase text-[9px] tracking-widest italic">Google Maps Protocol Active</p>
      </header>

      <div className="bg-white p-6 md:p-10 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
          {/* Top Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Link to Project</label>
              <select
                className="w-full h-[56px] px-5 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                value={newEntry.jobId}
                onChange={e => setNewEntry({ ...newEntry, jobId: e.target.value })}
              >
                <option value="">(None - General Travel)</option>
                {state.jobs
                  .filter(j => j.status !== 'Cancelled')
                  .map(j => (
                    <option key={j.id} value={j.id}>
                      {j.id} - {j.description}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Start Date</label>
              <div className="w-full">
                <input
                  type="date"
                  className="w-full h-[56px] px-5 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                  value={newEntry.date}
                  onChange={e => setNewEntry({ ...newEntry, date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">End Date (Optional)</label>
              <div className="w-full">
                <input
                  type="date"
                  className="w-full h-[56px] px-5 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                  value={newEntry.endDate}
                  onChange={e => setNewEntry({ ...newEntry, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Internal Memo</label>
              <input
                placeholder="Notes..."
                className="w-full h-[56px] px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none"
                value={newEntry.description}
                onChange={e => setNewEntry({ ...newEntry, description: e.target.value })}
              />
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <div className="space-y-2 md:col-span-3">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Start Point</label>
              <input
                placeholder="Postcode / City"
                className="w-full h-[56px] px-6 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase"
                value={newEntry.startPostcode}
                onChange={e => {
                  setCalcError(null);
                  setNewEntry({ ...newEntry, startPostcode: e.target.value.toUpperCase() });
                }}
                onBlur={() => handleCalculateMileage()}
              />
            </div>

            <div className="space-y-2 md:col-span-3">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">End Point</label>
              <input
                placeholder="Postcode / City"
                className="w-full h-[56px] px-6 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase"
                value={newEntry.endPostcode}
                onChange={e => {
                  setCalcError(null);
                  setNewEntry({ ...newEntry, endPostcode: e.target.value.toUpperCase() });
                }}
                onBlur={() => handleCalculateMileage()}
              />
            </div>

            <div className="space-y-2 md:col-span-2 relative">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Single Leg</label>

              <div
                className={`relative px-4 border rounded-2xl flex items-center justify-between font-black text-sm h-[56px] transition-all
                ${
                  isCalculating
                    ? 'border-indigo-400 bg-indigo-50 animate-pulse'
                    : calcError
                      ? 'border-rose-300 bg-rose-50'
                      : 'border-indigo-100 bg-indigo-50 text-indigo-700'
                }`}
              >
                <input
                  type="number"
                  step="0.01"
                  className={`w-full bg-transparent outline-none font-black ${
                    calcError ? 'text-rose-600' : 'text-indigo-700'
                  } placeholder:text-indigo-300`}
                  value={newEntry.distanceMiles || ''}
                  placeholder={isCalculating ? '...' : '0.00'}
                  onChange={e => {
                    setCalcError(null);
                    setNewEntry({ ...newEntry, distanceMiles: parseFloat(e.target.value) || 0 });
                  }}
                />

                {/* THIS is now a guaranteed clickable button; force recalculation */}
                <button
                  type="button"
                  onClick={() => handleCalculateMileage({ force: true })}
                  disabled={isCalculating}
                  aria-label="Recalculate mileage"
                  title="Recalculate mileage"
                  className={`${isCalculating ? 'opacity-30' : 'hover:text-indigo-600'} text-indigo-400 ml-2 shrink-0 transition-colors`}
                >
                  <i className={`fa-solid ${isCalculating ? 'fa-spinner animate-spin' : 'fa-arrows-rotate'} text-[14px]`} />
                </button>
              </div>

              {calcError && (
                <p className="text-[8px] text-rose-600 font-black uppercase tracking-tighter px-1 mt-1">
                  {calcError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Trips</label>
                <input
                  type="number"
                  min="1"
                  className="w-full h-[56px] px-4 bg-white border border-slate-200 rounded-2xl font-black outline-none text-center"
                  value={newEntry.numTrips}
                  onChange={e => setNewEntry({ ...newEntry, numTrips: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Return?</label>
                <button
                  type="button"
                  onClick={() => setNewEntry({ ...newEntry, isReturn: !newEntry.isReturn })}
                  className={`w-full h-[56px] py-4 rounded-2xl font-black text-[10px] uppercase border transition-all ${
                    newEntry.isReturn
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  {newEntry.isReturn ? 'YES' : 'NO'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving || (newEntry.distanceMiles === 0 && !isCalculating)}
              className="h-[56px] md:col-span-2 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <i className="fa-solid fa-spinner animate-spin" /> : <i className="fa-solid fa-plus mr-1" />}
              {isSaving ? 'Syncing' : 'Add to Ledger'}
            </button>
          </div>
        </form>
      </div>

      <div className="flex flex-col md:flex-row justify-end gap-4">
        <div className="bg-white border border-slate-200 p-8 rounded-[40px] shadow-sm flex items-center gap-10 w-full md:w-auto">
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fiscal Total</p>
            <p className="text-4xl font-black text-slate-900">
              {totals.miles.toFixed(1)} <span className="text-[12px] text-slate-400">mi</span>
            </p>
          </div>
          <div className="w-px h-12 bg-slate-100" />
          <div className="text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reclaim Val</p>
            <p className="text-4xl font-black text-indigo-600">{formatCurrency(totals.value, state.user)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-8">Date</th>
                <th className="p-8">Project Ref</th>
                <th className="p-8">Description</th>
                <th className="p-8">Route</th>
                <th className="p-8 text-right">Total mi</th>
                <th className="p-8 text-right">Valuation</th>
                <th className="p-8 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-medium">
              {state.mileage.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-24 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest italic">
                    Operational travel ledger is empty
                  </td>
                </tr>
              ) : (
                state.mileage
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map(record => {
                    const totalTripMiles =
                      (record.distanceMiles || 0) * (record.numTrips || 1) * (record.isReturn ? 2 : 1);

                    const dateLabel = record.endDate
                      ? `${formatDate(record.date)} - ${formatDate(record.endDate)}`
                      : formatDate(record.date);

                    return (
                      <tr key={record.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-8 text-[11px] font-black text-slate-900 whitespace-nowrap">{dateLabel}</td>
                        <td className="p-8 text-[10px] font-black text-indigo-500">
                          {record.jobId || <span className="text-slate-200 italic">None</span>}
                        </td>
                        <td className="p-8 text-[11px] font-bold text-slate-600 italic truncate max-w-[150px]">
                          {record.description || 'Travel expenses'}
                        </td>
                        <td className="p-8 text-[10px] font-black text-slate-700">
                          <span className="flex items-center gap-3">
                            {record.startPostcode}
                            <i className="fa-solid fa-arrow-right-long text-indigo-400" />
                            {record.endPostcode}
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-[8px] uppercase tracking-tighter">
                              {record.isReturn ? 'RTN' : 'SGL'} {record.numTrips > 1 ? `x${record.numTrips}` : ''}
                            </span>
                          </span>
                        </td>
                        <td className="p-8 text-right font-black text-slate-900">{totalTripMiles.toFixed(1)}</td>
                        <td className="p-8 text-right font-black text-indigo-600">
                          {formatCurrency(totalTripMiles * MILEAGE_RATE, state.user)}
                        </td>
                        <td className="p-8 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {record.jobId && (
                              <button
                                onClick={() => handleBillToProject(record)}
                                disabled={isBilling === record.id}
                                title="Add as line item to project invoice"
                                className="bg-emerald-50 text-emerald-600 w-11 h-11 flex items-center justify-center rounded-xl border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                              >
                                {isBilling === record.id ? (
                                  <i className="fa-solid fa-spinner animate-spin" />
                                ) : (
                                  <i className="fa-solid fa-file-invoice-dollar text-sm" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(record.id)}
                              className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                            >
                              <i className="fa-solid fa-trash-can text-sm" />
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
      </div>
    </div>
  );
};
