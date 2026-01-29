import React, { useState, useEffect, useMemo } from 'react';
import { DB } from '../services/db';
import { Tenant, UserPlan } from '../types';
import { differenceInDays, parseISO, addMonths, format } from 'date-fns';

interface SettingsProps {
  user: Tenant | null;
  onLogout: () => void;
  onRefresh: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, onLogout, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'billing'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | undefined>(user?.logoUrl);

  const trialInfo = useMemo(() => {
    if (!user) return null;
    const start = user.trialStartDate ? parseISO(user.trialStartDate) : new Date();
    const expiry = addMonths(start, 3);
    const daysLeft = Math.max(0, differenceInDays(expiry, new Date()));
    
    return { 
      plan: user.plan,
      daysLeft,
      expiryDate: format(expiry, 'dd MMM yyyy')
    };
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const formData = new FormData(e.currentTarget);
      const updated: Tenant = {
        ...user!,
        name: (formData.get('name') as string) || user?.name || '',
        businessName: (formData.get('businessName') as string) || user?.businessName || '',
        businessAddress: (formData.get('businessAddress') as string) || user?.businessAddress || '',
        bankDetails: (formData.get('bankDetails') as string) || user?.bankDetails || '',
        logoUrl: logoPreview,
        isVatRegistered: formData.get('isVat') === 'on',
        vatNumber: (formData.get('vatNumber') as string) || ''
      };
      await DB.updateTenant(updated);
      setSaveSuccess(true);
      onRefresh();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) { } finally { setIsSaving(false); }
  };

  const handleSubscribe = async () => {
    setIsSaving(true);
    alert("Redirecting to Stripe for £4.99/mo subscription...");
    setTimeout(async () => {
      if (user) {
        await DB.updateTenant({ ...user, plan: UserPlan.ACTIVE });
        onRefresh();
        setIsSaving(false);
      }
    }, 1500);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none">Settings</h2>
          <p className="text-slate-500 font-medium mt-1">Workspace configuration for {user?.email}</p>
        </div>
        <button onClick={onLogout} className="px-6 py-3 bg-white text-rose-500 border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm">Sign Out</button>
      </header>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        <button onClick={() => setActiveTab('profile')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'profile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Profile</button>
        <button onClick={() => setActiveTab('billing')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'billing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Subscription</button>
      </div>

      {activeTab === 'profile' && (
        <form onSubmit={handleUpdateProfile} className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Legal Name</label>
              <input name="name" defaultValue={user?.name} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Business Name</label>
              <input name="businessName" defaultValue={user?.businessName} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Billing Address</label>
              <textarea name="businessAddress" defaultValue={user?.businessAddress} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold h-32 outline-none" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Bank Details (Remittance)</label>
              <textarea name="bankDetails" defaultValue={user?.bankDetails} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs h-24 outline-none" />
            </div>
          </div>
          <button type="submit" disabled={isSaving} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl">
            {isSaving ? 'Saving...' : 'Sync Profile Updates'}
          </button>
        </form>
      )}

      {activeTab === 'billing' && (
        <div className="max-w-lg mx-auto bg-slate-900 p-10 rounded-[48px] text-white shadow-2xl text-center">
           <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-2">Standard Plan</p>
           <h3 className="text-3xl font-black mb-10">FreelanceOS Access</h3>
           
           <div className="mb-10">
              <div className="text-7xl font-black">£4.99<span className="text-lg text-slate-500">/mo</span></div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-4">
                Trial Ends: {trialInfo?.expiryDate} ({trialInfo?.daysLeft} days left)
              </p>
           </div>

           <ul className="space-y-4 text-left text-xs font-bold text-slate-400 mb-10">
              <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Full AI Strategic Coach</li>
              <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Global Cloud Data Sync</li>
              <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Unlimited Projects & Clients</li>
              <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Automated Financial Ledger</li>
           </ul>

           {user?.plan === UserPlan.ACTIVE ? (
             <div className="w-full py-5 bg-emerald-500 rounded-3xl font-black text-xs uppercase">Subscription Active</div>
           ) : (
             <button onClick={handleSubscribe} className="w-full py-5 bg-indigo-600 rounded-3xl font-black text-xs uppercase hover:bg-indigo-500 transition-all">Start Subscription</button>
           )}
        </div>
      )}
    </div>
  );
};