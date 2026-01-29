
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
    startPostcode: '',
    endPostcode: '',
    numTrips: 1,
    isReturn: true,
    distanceMiles: 0,
    jobId: '',
    clientId: '',
    description: ''
  });

  // Effect to automatically calculate mileage when postcodes are valid
  useEffect(() => {
    const start = newEntry.startPostcode.trim();
    const end = newEntry.endPostcode.trim();
    const key = `${start}-${end}`;

    if (start.length >= 5 && end.length >= 5 && key !== lastCalculatedRef.current) {
      const timer = setTimeout(() => {
        handleCalculateMileage();
      }, 1000); // Debounce
      return () => clearTimeout(timer);
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
      console.warn("Distance calculation lookup failed:", err);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !newEntry.startPostcode || !newEntry.endPostcode || newEntry.distanceMiles <= 0) {
      if (newEntry.distanceMiles <= 0) alert("Please enter valid postcodes to fetch driving distance.");
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
      alert("Failed to save mileage record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Remove this mileage log?")) {
      await DB.deleteMileage(id);
      onRefresh();
    }
  };

  const totals = useMemo(() => {
    return state.mileage.reduce((acc, curr) => {
      const tripDistance = curr.distanceMiles * curr.numTrips * (curr.isReturn ? 2 : 1);
      return {
        miles: acc.miles + tripDistance,
        value: acc.value + (tripDistance * MILEAGE_RATE)
      };
    }, { miles: 0, value: 0 });
  }, [state.mileage]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Travel & Mileage</h2>
          <p className="text-slate-500 font-medium">Automatic distance lookup powered by map protocols.</p>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm flex items-center gap-8">
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Distance</p>
              <p className="text-2xl font-black text-slate-900">{totals.miles.toFixed(1)} <span className="text-xs text-slate-400">mi</span></p>
           </div>
           <div className="w-px h-10 bg-slate-100"></div>
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Claim Value</p>
              <p className="text-2xl font-black text-indigo-600">{formatCurrency(totals.value, state.user)}</p>
           </div>
        </div>
      </header>

      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 px-1 flex items-center gap-2">
          <i className="fa-solid fa-route text-indigo-600"></i> Register New Journey
        </h3>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end relative z-10">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase px-1">Date</label>
            <input type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" value={newEntry.date} onChange={e => setNewEntry({...newEntry, date: e.target.value})} />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase px-1">Start Postcode</label>
            <input placeholder="SW1A 1AA" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase" value={newEntry.startPostcode} onChange={e => setNewEntry({...newEntry, startPostcode: e.target.value.toUpperCase()})} />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase px-1">End Postcode</label>
            <input placeholder="E1 6XL" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase" value={newEntry.endPostcode} onChange={e => setNewEntry({...newEntry, endPostcode: e.target.value.toUpperCase()})} />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase px-1">Distance (Miles)</label>
            <div className={`px-4 py-3 bg-indigo-50 border rounded-2xl flex items-center justify-between font-black text-sm h-[52px] ${isCalculating ? 'border-indigo-400 animate-pulse' : 'border-indigo-100 text-indigo-700'}`}>
              {isCalculating ? (
                <i className="fa-solid fa-spinner animate-spin mx-auto text-indigo-400"></i>
              ) : (
                <input 
                  type="number" 
                  step="0.1" 
                  className="w-full bg-transparent outline-none font-black text-indigo-700" 
                  value={newEntry.distanceMiles || ''} 
                  placeholder="0.0"
                  onChange={e => setNewEntry({...newEntry, distanceMiles: parseFloat(e.target.value) || 0})} 
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
             <label className="text-[10px] font-black text-slate-400 uppercase px-1">Trip Type</label>
             <div className="flex gap-2">
                <button type="button" onClick={() => setNewEntry({...newEntry, isReturn: !newEntry.isReturn})} className={`flex-1 px-4 py-3 rounded-2xl font-black text-[10px] uppercase border transition-all ${newEntry.isReturn ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>
                  {newEntry.isReturn ? 'Return' : 'Single'}
                </button>
             </div>
          </div>

          <button type="submit" disabled={isSaving || newEntry.distanceMiles === 0} className="h-[52px] bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2">
             {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-floppy-disk"></i>}
             Save Journey
          </button>
        </form>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Route</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                <th className="p-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Miles</th>
                <th className="p-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Value</th>
                <th className="p-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {state.mileage.length === 0 ? (
                <tr><td colSpan={6} className="p-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">No travel logs recorded</td></tr>
              ) : (
                state.mileage.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(record => {
                  const totalTripMiles = record.distanceMiles * record.numTrips * (record.isReturn ? 2 : 1);
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 text-xs font-black text-slate-900">{formatDate(record.date)}</td>
                      <td className="p-6 text-[10px] font-black text-slate-700">
                        {record.startPostcode} <i className="fa-solid fa-arrow-right mx-2 text-slate-300"></i> {record.endPostcode}
                      </td>
                      <td className="p-6">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${record.isReturn ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                          {record.isReturn ? 'Return' : 'Single'}
                        </span>
                      </td>
                      <td className="p-6 text-right font-black text-slate-900">{totalTripMiles.toFixed(1)}</td>
                      <td className="p-6 text-right font-black text-indigo-600">{formatCurrency(totalTripMiles * MILEAGE_RATE, state.user)}</td>
                      <td className="p-6 text-center">
                         <button onClick={() => handleDelete(record.id)} className="text-slate-300 hover:text-rose-500"><i className="fa-solid fa-trash-can text-xs"></i></button>
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
