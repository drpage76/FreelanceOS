
import React, { useState, useMemo } from 'react';
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
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
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

  const handleCalculateMileage = async () => {
    const start = newEntry.startPostcode.trim();
    const end = newEntry.endPostcode.trim();

    if (!start || !end) {
      alert("Please provide both start and end postcodes.");
      return;
    }
    
    setIsCalculating(true);
    try {
      const result = await calculateDrivingDistance(start, end);
      if (result.miles !== null) {
        setNewEntry(prev => ({ ...prev, distanceMiles: result.miles || 0 }));
        setGroundingSources(result.sources || []);
      } else {
        alert("The AI was unable to calculate that specific route. Please check your postcodes or enter the distance manually.");
      }
    } catch (err) {
      alert("Service error during calculation. Please try again or enter distance manually.");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !newEntry.startPostcode || !newEntry.endPostcode || newEntry.distanceMiles <= 0) {
      if (newEntry.distanceMiles <= 0) alert("Please calculate or enter the distance before saving.");
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
      setGroundingSources([]);
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
          <p className="text-slate-500 font-medium">Postcode-to-postcode intelligence powered by Google Maps grounding.</p>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm flex items-center gap-8">
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Distance</p>
              <p className="text-2xl font-black text-slate-900">{totals.miles.toFixed(1)} <span className="text-xs text-slate-400">mi</span></p>
           </div>
           <div className="w-px h-10 bg-slate-100"></div>
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Claim Value</p>
              <p className="text-2xl font-black text-indigo-600">{formatCurrency(totals.value)}</p>
           </div>
        </div>
      </header>

      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <i className="fa-solid fa-map-location-dot text-8xl text-indigo-600"></i>
        </div>
        
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 px-1 flex items-center gap-2">
          <i className="fa-solid fa-route text-indigo-600"></i> Log Journey
        </h3>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end relative z-10">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase px-1">Date</label>
            <input type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={newEntry.date} onChange={e => setNewEntry({...newEntry, date: e.target.value})} />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase px-1">From Postcode</label>
            <div className="relative">
              <i className="fa-solid fa-location-dot absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
              <input placeholder="SW1A 1AA" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase focus:ring-2 focus:ring-indigo-500" value={newEntry.startPostcode} onChange={e => setNewEntry({...newEntry, startPostcode: e.target.value.toUpperCase()})} />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase px-1">To Postcode</label>
            <div className="relative">
              <i className="fa-solid fa-flag-checkered absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
              <input placeholder="E1 6XL" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none uppercase focus:ring-2 focus:ring-indigo-500" value={newEntry.endPostcode} onChange={e => setNewEntry({...newEntry, endPostcode: e.target.value.toUpperCase()})} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase px-1">Distance & Rate</label>
            <div className="flex gap-2">
              <div className="flex-1 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between font-black text-sm text-indigo-700 h-[52px]">
                {isCalculating ? (
                  <i className="fa-solid fa-spinner animate-spin mx-auto text-indigo-400"></i>
                ) : (
                  <>
                    <input 
                        type="number" 
                        step="0.1" 
                        className="w-16 bg-transparent outline-none font-black text-indigo-700" 
                        value={newEntry.distanceMiles || ''} 
                        placeholder="0.0"
                        onChange={e => setNewEntry({...newEntry, distanceMiles: parseFloat(e.target.value) || 0})} 
                    />
                    <span className="text-[8px] opacity-50 ml-1">(@ £0.45)</span>
                  </>
                )}
              </div>
              <button 
                type="button" 
                onClick={handleCalculateMileage} 
                disabled={isCalculating || !newEntry.startPostcode || !newEntry.endPostcode}
                className={`px-4 py-3 rounded-2xl transition-all border shadow-sm ${isCalculating ? 'bg-slate-50 text-slate-300' : 'bg-white text-indigo-600 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 active:scale-95'}`}
                title="Calculate Distance via Maps"
              >
                <i className={`fa-solid ${isCalculating ? 'fa-hourglass-half' : 'fa-wand-magic-sparkles'}`}></i>
              </button>
            </div>
          </div>

          <div className="space-y-2">
             <label className="text-[10px] font-black text-slate-400 uppercase px-1">Instances / Type</label>
             <div className="flex gap-2">
                <input type="number" title="Number of Trips" className="w-16 px-2 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-center outline-none focus:ring-2 focus:ring-indigo-500" value={newEntry.numTrips} onChange={e => setNewEntry({...newEntry, numTrips: parseInt(e.target.value) || 1})} />
                <button type="button" onClick={() => setNewEntry({...newEntry, isReturn: !newEntry.isReturn})} className={`flex-1 px-4 py-3 rounded-2xl font-black text-[10px] uppercase transition-all border ${newEntry.isReturn ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100' : 'bg-white text-slate-400 border-slate-200'}`}>
                  {newEntry.isReturn ? 'Return' : 'Single'}
                </button>
             </div>
          </div>

          <button type="submit" disabled={isSaving || newEntry.distanceMiles === 0} className="h-[52px] bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
             {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-floppy-disk"></i>}
             Save Log
          </button>

          <div className="md:col-span-2 lg:col-span-3 space-y-2 mt-2">
             <label className="text-[10px] font-black text-slate-400 uppercase px-1">Associate with Project</label>
             <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={newEntry.jobId} onChange={e => setNewEntry({...newEntry, jobId: e.target.value})}>
                <option value="">General Business Travel</option>
                {state.jobs.map(j => <option key={j.id} value={j.id}>{j.id} - {j.description}</option>)}
             </select>
          </div>
          <div className="md:col-span-2 lg:col-span-3 space-y-2 mt-2">
             <label className="text-[10px] font-black text-slate-400 uppercase px-1">Optional Notes</label>
             <input placeholder="e.g. Equipment pickup from warehouse" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none focus:ring-2 focus:ring-indigo-500" value={newEntry.description} onChange={e => setNewEntry({...newEntry, description: e.target.value})} />
          </div>
        </form>

        {groundingSources.length > 0 && (
          <div className="mt-6 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-2">
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">Distance Verification Sources (Google Maps):</p>
            <div className="flex flex-wrap gap-2">
              {groundingSources.map((chunk, i) => (
                chunk.maps && (
                  <a key={i} href={chunk.maps.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 font-bold text-[10px] hover:bg-indigo-50 transition-colors shadow-sm">
                    <i className="fa-solid fa-location-dot text-[8px]"></i>
                    {chunk.maps.title || "Route View"}
                  </a>
                )
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs shadow-sm">
            <i className="fa-solid fa-info"></i>
          </div>
          <p className="text-xs font-bold text-indigo-900">
            HMRC Approved Rate: <span className="text-indigo-600">45p per mile</span> for first 10,000 business miles.
          </p>
        </div>
        <div className="text-right">
           <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Estimated Value</p>
           <p className="text-sm font-black text-indigo-700">
             {newEntry.distanceMiles > 0 ? formatCurrency(newEntry.distanceMiles * newEntry.numTrips * (newEntry.isReturn ? 2 : 1) * MILEAGE_RATE) : '£0.00'}
           </p>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Route</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trip Type</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Project</th>
                <th className="p-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Miles</th>
                <th className="p-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Claim (£)</th>
                <th className="p-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {state.mileage.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-20 text-center">
                    <div className="flex flex-col items-center">
                       <i className="fa-solid fa-map-marked-alt text-slate-100 text-6xl mb-4"></i>
                       <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No travel logs recorded yet</p>
                    </div>
                  </td>
                </tr>
              ) : (
                state.mileage.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(record => {
                  const job = state.jobs.find(j => j.id === record.jobId);
                  const totalTripMiles = record.distanceMiles * record.numTrips * (record.isReturn ? 2 : 1);
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-6 text-xs font-black text-slate-900">{formatDate(record.date)}</td>
                      <td className="p-6">
                        <div className="flex items-center gap-2">
                           <span className="font-mono text-[10px] font-black bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{record.startPostcode}</span>
                           <i className="fa-solid fa-chevron-right text-[10px] text-slate-300"></i>
                           <span className="font-mono text-[10px] font-black bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 text-indigo-700">{record.endPostcode}</span>
                        </div>
                        {record.description && <p className="text-[10px] text-slate-400 mt-1.5 italic leading-relaxed">{record.description}</p>}
                      </td>
                      <td className="p-6">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${record.isReturn ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                          {record.numTrips > 1 ? `${record.numTrips}x ` : ''}{record.isReturn ? 'Return' : 'Single'}
                        </span>
                      </td>
                      <td className="p-6">
                        {job ? (
                          <div className="flex flex-col">
                             <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">#{job.id}</span>
                             <span className="text-[10px] text-slate-400 font-medium truncate max-w-[140px]">{job.description}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black text-slate-300 uppercase italic">Unlinked</span>
                        )}
                      </td>
                      <td className="p-6 text-right font-black text-slate-900">{totalTripMiles.toFixed(1)} <span className="text-[10px] text-slate-400 uppercase font-bold">mi</span></td>
                      <td className="p-6 text-right font-black text-indigo-600">{formatCurrency(totalTripMiles * MILEAGE_RATE)}</td>
                      <td className="p-6 text-center">
                         <button onClick={() => handleDelete(record.id)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-500 hover:text-white transition-all border border-slate-100">
                            <i className="fa-solid fa-trash-can text-xs"></i>
                         </button>
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
