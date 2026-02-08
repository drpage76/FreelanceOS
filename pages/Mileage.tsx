
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
  const lastCalculatedRef = useRef("");

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
  }, [newEntry.jobId, state.jobs]);

  useEffect(() => {
    const start = newEntry.startPostcode.trim();
    const end = newEntry.endPostcode.trim();
    
    if (start.length >= 4 && end.length >= 4) {
      const key = `${start}-${end}`;
      if (key !== lastCalculatedRef.current) {
        const timer = setTimeout(() => {
          handleCalculateMileage();
        }, 2000); 
        return () => clearTimeout(timer);
      }
    }
  }, [newEntry.startPostcode, newEntry.endPostcode]);

  const handleCalculateMileage = async () => {
    const start = newEntry.startPostcode.trim();
    const end = newEntry.endPostcode.trim();

    if (!start || !end) return;
    
    setIsCalculating(true);
    lastCalculatedRef.current = `${start}-${end}`;
    
    try {
      const result = await calculateDrivingDistance(start, end, state.user?.country);
      if (result.miles !== null && result.miles > 0) {
        setNewEntry(prev => ({ ...prev, distanceMiles: result.miles || 0 }));
      }
    } catch (err) {
      console.warn("Map Protocol lookup failed:", err);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !newEntry.startPostcode || !newEntry.endPostcode) return;
    
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
      lastCalculatedRef.current = "";
      onRefresh();
    } catch (err) {
      alert("Failed to sync record to cloud.");
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

      alert("Mileage successfully added as a line item to the project workspace.");
      onRefresh();
    } catch (err) {
      alert("Billing protocol failed.");
    } finally {
      setIsBilling(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Remove this entry from the ledger?")) {
      await DB.deleteMileage(id);
      onRefresh();
    }
  };

  const totals = useMemo(() => {
    return state.mileage.reduce((acc, curr) => {
      const tripDistance = (curr.distanceMiles || 0) * (curr.numTrips || 1) * (curr.isReturn ? 2 : 1);
      return {
        miles: acc.miles + tripDistance,
        value: acc.value + (tripDistance * MILEAGE_RATE)
      };
    }, { miles: 0, value: 0 });
  }, [state.mileage]);

  return (
    <div className="space-y-6 px-4">
      <header>
        <h2 className="text-3xl font-black text-slate-900 leading-tight italic">Travel & Mileage</h2>
        <p className="text-slate-500 font-bold uppercase text-[9px] tracking-widest italic">Google Maps Protocol Active</p>
      </header>

      <div className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Link to Project</label>
              <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" value={newEntry.jobId} onChange={e => setNewEntry({...newEntry, jobId: e.target.value})}>
                <option value="">(None - General Travel)</option>
                {state.jobs.filter(j => j.status !== 'Cancelled').map(j => (
                  <option key={j.id} value={j.id}>{j.id} - {j.description}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Start Date</label>
              <input type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" value={newEntry.date} onChange={e => setNewEntry({...newEntry, date: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">End Date (Optional)</label>
              <input type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" value={newEntry.endDate} onChange={e => setNewEntry({...newEntry, endDate: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Internal Memo</label>
              <input placeholder="Description..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={newEntry.description} onChange={e => setNewEntry({...newEntry, description: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Start Point</label>
              <input placeholder="Postcode/City" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase" value={newEntry.startPostcode} onChange={e => setNewEntry({...newEntry, startPostcode: e.target.value.toUpperCase()})} />
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">End Point</label>
              <input placeholder="Postcode/City" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase" value={newEntry.endPostcode} onChange={e => setNewEntry({...newEntry, endPostcode: e.target.value.toUpperCase()})} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Single Leg Distance</label>
              <div className={`relative px-4 py-4 bg-indigo-50 border rounded-2xl flex items-center justify-between font-black text-sm h-[56px] transition-all ${isCalculating ? 'border-indigo-400 animate-pulse' : 'border-indigo-100 text-indigo-700'}`}>
                <input 
                  type="number" 
                  step="0.01" 
                  className="w-full bg-transparent outline-none font-black text-indigo-700 placeholder:text-indigo-300" 
                  value={newEntry.distanceMiles || ''} 
                  placeholder={isCalculating ? "Calculating..." : "0.00"}
                  onChange={e => setNewEntry({...newEntry, distanceMiles: parseFloat(e.target.value) || 0})} 
                />
                <button type="button" onClick={handleCalculateMileage} className="text-indigo-400 hover:text-indigo-600 ml-1 shrink-0">
                  <i className="fa-solid fa-arrows-rotate text-[12px]"></i>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Trips</label>
                 <input type="number" min="1" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-2xl font-black outline-none h-[56px] text-center" value={newEntry.numTrips} onChange={e => setNewEntry({...newEntry, numTrips: parseInt(e.target.value) || 1})} />
               </div>
               <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Return?</label>
                 <button type="button" onClick={() => setNewEntry({...newEntry, isReturn: !newEntry.isReturn})} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase border transition-all h-[56px] ${newEntry.isReturn ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>
                   {newEntry.isReturn ? 'YES' : 'NO'}
                 </button>
               </div>
            </div>

            <button type="submit" disabled={isSaving || (newEntry.distanceMiles === 0 && !isCalculating)} className="h-[56px] bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50">
               {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-plus mr-1"></i>}
               {isSaving ? 'Syncing' : 'Add to Ledger'}
            </button>
          </div>
        </form>
      </div>

      <div className="flex flex-col md:flex-row justify-end gap-4">
        <div className="bg-white border border-slate-200 p-6 rounded-[32px] shadow-sm flex items-center gap-8 w-full md:w-auto">
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fiscal Total</p>
              <p className="text-2xl font-black text-slate-900">{totals.miles.toFixed(1)} <span className="text-[10px] text-slate-400">mi</span></p>
           </div>
           <div className="w-px h-10 bg-slate-100"></div>
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reclaim Val</p>
              <p className="text-2xl font-black text-indigo-600">{formatCurrency(totals.value, state.user)}</p>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-6">Date</th>
                <th className="p-6">Project Ref</th>
                <th className="p-6">Description</th>
                <th className="p-6">Route</th>
                <th className="p-6 text-right">Total mi</th>
                <th className="p-6 text-right">Valuation</th>
                <th className="p-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {state.mileage.length === 0 ? (
                <tr><td colSpan={7} className="p-24 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest italic">Operational travel ledger is empty</td></tr>
              ) : (
                state.mileage.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(record => {
                  const totalTripMiles = (record.distanceMiles || 0) * (record.numTrips || 1) * (record.isReturn ? 2 : 1);
                  const dateLabel = record.endDate ? `${formatDate(record.date)} - ${formatDate(record.endDate)}` : formatDate(record.date);
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-6 text-[11px] font-black text-slate-900 whitespace-nowrap">{dateLabel}</td>
                      <td className="p-6 text-[10px] font-black text-indigo-500">{record.jobId || <span className="text-slate-200 italic">None</span>}</td>
                      <td className="p-6 text-[11px] font-bold text-slate-600 italic truncate max-w-[150px]">{record.description || 'Travel expenses'}</td>
                      <td className="p-6 text-[10px] font-black text-slate-700">
                        <span className="flex items-center gap-2">
                          {record.startPostcode} 
                          <i className="fa-solid fa-arrow-right-long text-indigo-400"></i> 
                          {record.endPostcode}
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[8px] uppercase tracking-tighter">
                            {record.isReturn ? 'RTN' : 'SGL'} {record.numTrips > 1 ? `x${record.numTrips}` : ''}
                          </span>
                        </span>
                      </td>
                      <td className="p-6 text-right font-black text-slate-900">{totalTripMiles.toFixed(1)}</td>
                      <td className="p-6 text-right font-black text-indigo-600">{formatCurrency(totalTripMiles * MILEAGE_RATE, state.user)}</td>
                      <td className="p-6 text-center">
                         <div className="flex items-center justify-center gap-2">
                           {record.jobId && (
                             <button 
                               onClick={() => handleBillToProject(record)} 
                               disabled={isBilling === record.id}
                               title="Add as line item to project invoice"
                               className="bg-emerald-50 text-emerald-600 w-10 h-10 flex items-center justify-center rounded-xl border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                             >
                               {isBilling === record.id ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-file-invoice-dollar"></i>}
                             </button>
                           )}
                           <button onClick={() => handleDelete(record.id)} className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"><i className="fa-solid fa-trash-can text-xs"></i></button>
                         </div>
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
