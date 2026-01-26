
import React, { useEffect, useState } from 'react';
// Fix: Removed extensions from relative imports
import { Client } from '../types';
import { DB, generateId } from '../services/db';

interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => Promise<void> | void;
  tenantId: string;
  initialData?: Client | null;
}

export const AddClientModal: React.FC<AddClientModalProps> = ({ isOpen, onClose, onSave, tenantId, initialData }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    terms: 30
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        email: initialData.email,
        phone: initialData.phone || '',
        address: initialData.address,
        terms: initialData.paymentTermsDays
      });
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        terms: 30
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving) return;

    if (!formData.name.trim()) {
      alert("Client name is required");
      return;
    }

    setIsSaving(true);
    const client: Client = {
      id: initialData ? initialData.id : generateId(),
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      paymentTermsDays: formData.terms,
      tenant_id: tenantId || 'local-user'
    };

    try {
      await DB.saveClient(client);
      if (onSave) {
        await onSave();
      }
      onClose();
    } catch (err: any) {
      console.error("Save Client Error:", err);
      alert(`System failed to save client: ${err.message || 'Check your internet connection and Supabase configuration.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="bg-white w-full max-md rounded-[32px] shadow-2xl overflow-hidden border border-slate-200">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-2xl font-black text-slate-900">{initialData ? 'Edit Client' : 'Add New Client'}</h3>
          <button disabled={isSaving} onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Client Name</label>
            <input 
              disabled={isSaving}
              name="name" 
              required 
              placeholder="e.g. Acme Production Ltd" 
              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-bold disabled:opacity-50"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Email Address</label>
              <input 
                disabled={isSaving}
                name="email" 
                type="email" 
                placeholder="billing@acme.com" 
                className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium disabled:opacity-50"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Phone Number</label>
              <input 
                disabled={isSaving}
                name="phone" 
                type="tel" 
                placeholder="01234 567890" 
                className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-medium disabled:opacity-50"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Full Billing Address</label>
            <textarea 
              disabled={isSaving}
              name="address" 
              rows={3} 
              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none text-sm font-medium disabled:opacity-50" 
              placeholder="Street, City, Postcode"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
            ></textarea>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Payment Terms (days)</label>
            <input 
              disabled={isSaving}
              name="terms" 
              type="number" 
              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-bold disabled:opacity-50"
              value={formData.terms}
              onChange={(e) => setFormData({...formData, terms: parseInt(e.target.value) || 0})}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button disabled={isSaving} type="button" onClick={onClose} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all disabled:opacity-50">Cancel</button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : null}
              {isSaving ? 'Syncing...' : (initialData ? 'Update Client' : 'Save Client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
