import React, { useState, useMemo, useEffect } from 'react';
import { Client, Job, JobStatus, JobItem, JobShift, SchedulingType } from '../types';
import { generateJobId } from '../utils';
import { DB, generateId } from '../services/db';
import { STATUS_COLORS } from '../constants';

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  onSave: (job: Job, items: JobItem[], clientName: string) => Promise<void>;
  tenant_id: string;
  googleAccessToken?: string;
}

const DEFAULT_JOB_DETAILS = {
  description: '',
  location: '',
  poNumber: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  status: JobStatus.POTENTIAL,
  schedulingType: SchedulingType.CONTINUOUS,
  syncToCalendar: true
};

export const CreateJobModal: React.FC<CreateJobModalProps> = ({ isOpen, onClose, clients, onSave, tenant_id }) => {
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', address: '', terms: 30 });
  const [isSaving, setIsSaving] = useState(false);
  
  const [jobDetails, setJobDetails] = useState(DEFAULT_JOB_DETAILS);
  const [shifts, setShifts] = useState<Partial<JobShift>[]>([]);
  const [items, setItems] = useState<any[]>([{ description: 'Professional Services', qty: 1, unitPrice: 0 }]);

  useEffect(() => {
    if (isOpen) {
      setJobDetails(DEFAULT_JOB_DETAILS);
      setShifts([]);
      setItems([{ description: 'Professional Services', qty: 1, unitPrice: 0 }]);
      setSelectedClientId('');
      setIsAddingClient(false);
      setNewClient({ name: '', email: '', phone: '', address: '', terms: 30 });
    }
  }, [isOpen]);

  const totalRecharge = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.qty * (parseFloat(item.unitPrice) || 0)), 0);
  }, [items]);

  const handleAddShift = () => {
    setShifts([...shifts, { 
      id: generateId(), 
      title: 'Shift ' + (shifts.length + 1), 
      startDate: jobDetails.startDate, 
      endDate: jobDetails.startDate,
      startTime: '09:00', 
      endTime: '17:30',
      isFullDay: true
    }]);
  };

  const handleRemoveShift = (idx: number) => setShifts(shifts.filter((_, i) => i !== idx));

  const handleShiftChange = (idx: number, field: string, val: any) => {
    const next = [...shifts];
    (next[idx] as any)[field] = val;
    setShifts(next);
  };

  const handleAddItem = () => setItems([...items, { description: '', qty: 1, unitPrice: 0 }]);
  const handleRemoveItem = (idx: number) => items.length > 1 && setItems(items.filter((_, i) => i !== idx));
  const handleItemChange = (idx: number, field: string, val: any) => {
    const next = [...items];
    next[idx][field] = val;
    setItems(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!selectedClientId && !isAddingClient) {
      alert("Please select or create a client identity first.");
      return;
    }
    
    setIsSaving(true);
    try {
      let clientId = selectedClientId;
      let clientName = clients.find(c => c.id === clientId)?.name || '';

      if (isAddingClient) {
        const cid = generateId();
        const clientData: Client = {
          id: cid,
          name: newClient.name,
          email: newClient.email,
          phone: newClient.phone,
          address: newClient.address,
          paymentTermsDays: newClient.terms,
          tenant_id
        };
        await DB.saveClient(clientData);
        clientId = cid;
        clientName = newClient.name;
      }

      let startDate = jobDetails.startDate;
      let endDate = jobDetails.endDate;

      if (jobDetails.schedulingType === SchedulingType.SHIFT_BASED && shifts.length > 0) {
        const startDates = shifts.map(s => s.startDate).filter(Boolean).sort();
        const endDates = shifts.map(s => s.endDate).filter(Boolean).sort();
        if (startDates.length > 0) startDate = startDates[0]!;
        if (endDates.length > 0) endDate = endDates[endDates.length - 1]!;
      }

      const jobId = generateJobId(startDate, Math.floor(Math.random() * 90) + 10);
      
      const newJob: Job = {
        ...jobDetails,
        id: jobId,
        clientId,
        startDate,
        endDate,
        totalRecharge,
        totalCost: 0,
        tenant_id,
        shifts: shifts.map(s => ({ 
          ...s, 
          jobId, 
          tenant_id, 
          title: s.title || 'Shift', 
          startDate: s.startDate || startDate, 
          endDate: s.endDate || s.startDate || startDate,
          startTime: s.startTime || '09:00', 
          endTime: s.endTime || '17:30',
          isFullDay: !!s.isFullDay
        })) as JobShift[]
      };

      const jobItems: JobItem[] = items.map(i => ({ 
        ...i, 
        id: generateId(), 
        jobId, 
        rechargeAmount: (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 
        actualCost: 0 
      }));
      
      await onSave(newJob, jobItems, clientName);
      onClose();
    } catch (err: any) { 
      alert(`Save Interrupted: ${err.message || 'Check your internet connection.'}`); 
    } finally { 
      setIsSaving(false); 
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 my-auto">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Project Builder</h3>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-slate-400 hover:text-rose-500 border border-slate-200 transition-all">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Client Selection */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Client Identity</label>
              <button type="button" onClick={() => setIsAddingClient(!isAddingClient)} className="text-xs font-black text-indigo-600 uppercase">
                {isAddingClient ? 'Cancel' : '+ New Client'}
              </button>
            </div>
            {!isAddingClient ? (
              <select required value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none">
                <option value="">Select Existing Client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 bg-indigo-50/30 p-6 rounded-[24px] border border-indigo-100 shadow-inner">
                <div className="col-span-2">
                   <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block px-1">New Client Name</label>
                   <input required placeholder="Legal Entity Name" className="w-full px-5 py-3 bg-white border border-indigo-200 rounded-xl font-bold outline-none" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
                </div>
                <div>
                   <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block px-1">Billing Email</label>
                   <input type="email" placeholder="billing@company.com" className="w-full px-5 py-3 bg-white border border-indigo-200 rounded-xl font-medium outline-none" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} />
                </div>
                <div>
                   <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block px-1">Phone Number</label>
                   <input placeholder="+44..." className="w-full px-5 py-3 bg-white border border-indigo-200 rounded-xl font-medium outline-none" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} />
                </div>
                <div className="col-span-2">
                   <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block px-1">Billing Address</label>
                   <textarea rows={2} placeholder="Full address for invoice" className="w-full px-5 py-3 bg-white border border-indigo-200 rounded-xl font-medium outline-none text-sm" value={newClient.address} onChange={e => setNewClient({...newClient, address: e.target.value})} />
                </div>
                <div className="col-span-2">
                   <label className="text-[9px] font-black text-indigo-400 uppercase mb-1 block px-1">Payment Terms (Days)</label>
                   <input type="number" className="w-full px-5 py-3 bg-white border border-indigo-200 rounded-xl font-bold outline-none" value={newClient.terms} onChange={e => setNewClient({...newClient, terms: parseInt(e.target.value) || 30})} />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-2 px-1">Project Title / Description</label>
              <input required value={jobDetails.description} onChange={e => setJobDetails({...jobDetails, description: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
            </div>
            
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-2 px-1">Pipeline Status</label>
              <select value={jobDetails.status} onChange={e => setJobDetails({...jobDetails, status: e.target.value as JobStatus})} className={`w-full px-6 py-4 border rounded-2xl font-black text-[11px] uppercase outline-none appearance-none ${STATUS_COLORS[jobDetails.status]}`}>
                {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-2 px-1">PO Number (Optional)</label>
              <input value={jobDetails.poNumber} onChange={e => setJobDetails({...jobDetails, poNumber: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" placeholder="e.g. 50029" />
            </div>

            <div className="col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-2 px-1">Venue / Location</label>
              <input required value={jobDetails.location} onChange={e => setJobDetails({...jobDetails, location: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" placeholder="Event Venue Name" />
            </div>
            
            {/* SCHEDULING SECTION - ALWAYS VISIBLE */}
            <div className="col-span-2 p-8 bg-slate-50/80 border border-slate-200 rounded-[32px] space-y-6">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <i className="fa-brands fa-google text-indigo-600"></i>
                     <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest italic">Production Schedule</h4>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setJobDetails({ ...jobDetails, syncToCalendar: !jobDetails.syncToCalendar })}
                    className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all border shadow-sm ${!jobDetails.syncToCalendar ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {!jobDetails.syncToCalendar ? "DONT SHOW IN CALENDAR" : "SYNC TO CALENDAR"}
                  </button>
               </div>
               
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight italic">Timeline Mode</p>
                <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
                  <button 
                    type="button" 
                    onClick={() => setJobDetails({ ...jobDetails, schedulingType: SchedulingType.CONTINUOUS })}
                    className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${jobDetails.schedulingType === SchedulingType.CONTINUOUS ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    Continuous
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setJobDetails({ ...jobDetails, schedulingType: SchedulingType.SHIFT_BASED })}
                    className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${jobDetails.schedulingType === SchedulingType.SHIFT_BASED ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    Shift-based
                  </button>
                </div>
              </div>

              {jobDetails.schedulingType === SchedulingType.SHIFT_BASED ? (
                <div className="space-y-4">
                  {shifts.map((s, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3 animate-in slide-in-from-left-1">
                      <div className="flex items-center justify-between">
                        <input className="px-3 py-2 bg-slate-50 rounded-lg text-xs font-black border-none outline-none flex-1 mr-2 text-indigo-600" placeholder="Shift Name (e.g. Load-in)" value={s.title || ''} onChange={e => handleShiftChange(idx, 'title', e.target.value)} />
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" className="w-3 h-3 rounded accent-indigo-600" checked={s.isFullDay || false} onChange={e => handleShiftChange(idx, 'isFullDay', e.target.checked)} />
                            <span className="text-[9px] font-black text-slate-400 uppercase">Full Day</span>
                          </label>
                          <button type="button" onClick={() => handleRemoveShift(idx)} className="text-slate-300 hover:text-rose-500 transition-colors"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[8px] font-black text-slate-300 uppercase px-1">Start Date</span>
                          <input type="date" className="w-full px-2 py-2 bg-slate-50 rounded-lg text-[10px] font-bold border-none outline-none" value={s.startDate || ''} onChange={e => handleShiftChange(idx, 'startDate', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-black text-slate-300 uppercase px-1">End Date</span>
                          <input type="date" className="w-full px-2 py-2 bg-slate-50 rounded-lg text-[10px] font-bold border-none outline-none" value={s.endDate || ''} onChange={e => handleShiftChange(idx, 'endDate', e.target.value)} />
                        </div>
                      </div>

                      {!s.isFullDay && (
                        <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                          <div className="space-y-1">
                            <span className="text-[8px] font-black text-slate-300 uppercase px-1">Start Time</span>
                            <input type="time" className="w-full px-2 py-2 bg-slate-50 rounded-lg text-[10px] font-bold border-none outline-none" value={s.startTime || ''} onChange={e => handleShiftChange(idx, 'startTime', e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[8px] font-black text-slate-300 uppercase px-1">End Time</span>
                            <input type="time" className="w-full px-2 py-2 bg-slate-50 rounded-lg text-[10px] font-bold border-none outline-none" value={s.endTime || ''} onChange={e => handleShiftChange(idx, 'endTime', e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={handleAddShift} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-white hover:text-indigo-600 hover:border-indigo-100 transition-all">+ Add Work Session</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase px-1">Project Start</span>
                    <input type="date" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold shadow-sm" value={jobDetails.startDate} onChange={e => setJobDetails({...jobDetails, startDate: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase px-1">Project Completion</span>
                    <input type="date" className="w-full px-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold shadow-sm" value={jobDetails.endDate} onChange={e => setJobDetails({...jobDetails, endDate: e.target.value})} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
             <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deliverables & Rate</label>
                <button type="button" onClick={handleAddItem} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">+ Add Entry</button>
             </div>
             <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                     <input className="col-span-7 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none" placeholder="Description..." value={item.description} onChange={e => handleItemChange(idx, 'description', e.target.value)} />
                     <input type="number" step="any" className="col-span-2 px-1 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-center outline-none" value={item.qty} onChange={e => handleItemChange(idx, 'qty', e.target.value)} />
                     <input type="number" step="any" className="col-span-2 px-1 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-right outline-none" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} />
                     <button type="button" onClick={() => handleRemoveItem(idx)} className="col-span-1 text-slate-300 hover:text-rose-500 flex justify-center"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                  </div>
                ))}
             </div>
          </div>

          <div className="flex justify-between items-center border-t border-slate-100 pt-8 sticky bottom-0 bg-white">
            <div className="flex flex-col">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Valuation</p>
              <p className="text-3xl font-black text-indigo-600">£{totalRecharge.toLocaleString()}</p>
            </div>
            <button type="submit" disabled={isSaving} className="px-12 py-4 bg-slate-900 text-white rounded-[24px] font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-3 hover:bg-black transition-all disabled:opacity-50">
              {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-up text-indigo-400"></i>}
              Issue Protocol
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};