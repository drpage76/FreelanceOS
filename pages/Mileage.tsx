
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppState, MileageRecord } from '../types';
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

  // Effect to automatically calculate mileage when postcodes reach valid length
  useEffect(() => {
    const start = newEntry.startPostcode.trim();
    const end = newEntry.endPostcode.trim();
    
    if (start.length >= 5 && end.length >= 5) {
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
      const result = await calculateDrivingDistance(start, end);
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
    
    if (newEntry.distanceMiles <= 0 && !isCalculating) {
      alert("Please enter a valid distance or wait for Map Protocol.");
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
      lastCalculatedRef.current = "";
      onRefresh();
    } catch (err) {
      alert("Failed to sync record to cloud.");
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

      {/* Entry Form - Now First */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Start Date</label>
              <input type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" value={newEntry.date} onChange={e => setNewEntry({...newEntry, date: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">End Date (Optional Range)</label>
              <input type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" value={newEntry.endDate} onChange={e => setNewEntry({...newEntry, endDate: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Description / Job Ref</label>
              <input placeholder="Client meeting / Project ID" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={newEntry.description} onChange={e => setNewEntry({...newEntry, description: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Unit Miles</label>
              <div className={`relative px-5 py-4 bg-indigo-50 border rounded-2xl flex items-center justify-between font-black text-sm h-[56px] transition-all ${isCalculating ? 'border-indigo-400 animate-pulse' : 'border-indigo-100 text-indigo-700'}`}>
                <input 
                  type="number" 
                  step="0.01" 
                  className="w-full bg-transparent outline-none font-black text-indigo-700 placeholder:text-indigo-300" 
                  value={newEntry.distanceMiles || ''} 
                  placeholder={isCalculating ? "GEOLOCATING..." : "0.00"}
                  onChange={e => setNewEntry({...newEntry, distanceMiles: parseFloat(e.target.value) || 0})} 
                />
                <button type="button" onClick={handleCalculateMileage} className="text-[10px] text-indigo-400 hover:text-indigo-600 ml-2" title="Manual Recalculate">
                  <i className="fa-solid fa-arrows-rotate"></i>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-6 items-end">
            <div className="lg:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Departure Postcode</label>
              <input placeholder="SW1..." className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase" value={newEntry.startPostcode} onChange={e => setNewEntry({...newEntry, startPostcode: e.target.value.toUpperCase()})} />
            </div>
            
            <div className="lg:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Destination Postcode</label>
              <input placeholder="E1..." className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase" value={newEntry.endPostcode} onChange={e => setNewEntry({...newEntry, endPostcode: e.target.value.toUpperCase()})} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Trips</label>
              <input type="number" min="1" className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl font-black outline-none h-[56px]" value={newEntry.numTrips} onChange={e => setNewEntry({...newEntry, numTrips: parseInt(e.target.value) || 1})} />
            </div>

            <div className="space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase px-1 tracking-widest">Return Trip?</label>
               <button type="button" onClick={() => setNewEntry({...newEntry, isReturn: !newEntry.isReturn})} className={`w-full px-4 py-4 rounded-2xl font-black text-[10px] uppercase border transition-all h-[56px] ${newEntry.isReturn ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>
                 {newEntry.isReturn ? 'Return' : 'Single'}
               </button>
            </div>

            <button type="submit" disabled={isSaving || (newEntry.distanceMiles === 0 && !isCalculating)} className="h-[56px] bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50">
               {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-plus-circle text-indigo-400"></i>}
               Add to Ledger
            </button>
          </div>
        </form>
      </div>

      {/* Summary Stats - Now After Form */}
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

      <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-6">Date Protocol</th>
                <th className="p-6">Description / Notes</th>
                <th className="p-6">Route Vector</th>
                <th className="p-6">Leg Type</th>
                <th className="p-6 text-right">Total mi</th>
                <th className="p-6 text-right">Valuation</th>
                <th className="p-6 text-center">Delete</th>
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
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 text-[11px] font-black text-slate-900 whitespace-nowrap">{dateLabel}</td>
                      <td className="p-6 text-[11px] font-bold text-slate-600 italic truncate max-w-[150px]">{record.description || 'Travel expenses'}</td>
                      <td className="p-6 text-[10px] font-black text-slate-700">
                        {record.startPostcode} <i className="fa-solid fa-arrow-right-long mx-2 text-indigo-400"></i> {record.endPostcode}
                      </td>
                      <td className="p-6">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${record.isReturn ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                          {record.isReturn ? 'Return' : 'Single'} {record.numTrips > 1 ? `x${record.numTrips}` : ''}
                        </span>
                      </td>
                      <td className="p-6 text-right font-black text-slate-900">{totalTripMiles.toFixed(1)}</td>
                      <td className="p-6 text-right font-black text-indigo-600">{formatCurrency(totalTripMiles * MILEAGE_RATE, state.user)}</td>
                      <td className="p-6 text-center">
                         <button onClick={() => handleDelete(record.id)} className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"><i className="fa-solid fa-trash-can text-xs"></i></button>
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
