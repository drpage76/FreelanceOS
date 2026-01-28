import React, { useState, useEffect, useMemo } from 'react';
import { DB } from '../services/db';
import { Tenant, UserPlan } from '../types';
import { differenceInDays, parseISO, addMonths } from 'date-fns';

interface SettingsProps {
  user: Tenant | null;
  onLogout: () => void;
  onRefresh: () => void;
}

// BETA WHITELIST (Add your free users here)
const BETA_EMAILS = [
  'admin@freelanceos.com',
  'drpage76@gmail.com'
];

export const Settings: React.FC<SettingsProps> = ({ user, onLogout, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'system'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | undefined>(user?.logoUrl);
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const checkCloud = async () => {
    setCloudStatus('checking');
    setErrorMsg(null);
    const result = await DB.testConnection();
    setCloudStatus(result.success ? 'online' : 'offline');
    onRefresh();
  };

  useEffect(() => { checkCloud(); }, []);

  const trialInfo = useMemo(() => {
    if (!user) return null;
    if (BETA_EMAILS.includes(user.email)) return { type: 'beta', daysLeft: Infinity };
    
    // Trial logic based on 90 days from signup
    // In production, trialStartDate would be set in Supabase metadata
    const start = user.trialStartDate ? parseISO(user.trialStartDate) : new Date();
    const expiry = addMonths(start, 3);
    const daysLeft = differenceInDays(expiry, new Date());
    return { type: 'trial', daysLeft: Math.max(0, daysLeft) };
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
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
    } catch (err: any) { setErrorMsg(err.message); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20 px-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none">Settings</h2>
          <p className="text-slate-500 font-medium mt-1">Founding Beta Access Member</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onLogout} className="px-6 py-3 text-slate-400 hover:text-rose-600 font-black text-[10px] uppercase tracking-widest transition-all">Sign Out</button>
          <div className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border ${cloudStatus === 'online' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cloudStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
            {cloudStatus}
          </div>
        </div>
      </header>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        <button onClick={() => setActiveTab('profile')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'profile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Profile</button>
        <button onClick={() => setActiveTab('billing')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'billing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Subscription</button>
        <button onClick={() => setActiveTab('system')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'system' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>System</button>
      </div>

      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-2">
          <div className="lg:col-span-8">
            <form onSubmit={handleUpdateProfile} className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1 tracking-widest">Legal Name</label>
                  <input name="name" defaultValue={user?.name} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1 tracking-widest">Trading Name</label>
                  <input name="businessName" defaultValue={user?.businessName} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1 tracking-widest">Billing Address</label>
                  <textarea name="businessAddress" defaultValue={user?.businessAddress} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none h-32 custom-scrollbar" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1 tracking-widest">Bank Details</label>
                  <input name="bankDetails" defaultValue={user?.bankDetails} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm outline-none" />
                </div>
              </div>
              <button type="submit" disabled={isSaving} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-sm uppercase shadow-2xl hover:bg-black transition-all">
                {isSaving ? 'Updating...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-2xl">
               <h3 className="text-xl font-black mb-4">Access Level</h3>
               <div className="bg-white/10 border border-white/20 p-6 rounded-3xl mb-6">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Status</p>
                  <p className="text-2xl font-black">{trialInfo?.type === 'beta' ? 'Founder Member' : 'Full Pro Trial'}</p>
               </div>
               {trialInfo?.type === 'trial' && (
                  <p className="text-xs font-medium text-indigo-100 mb-8 opacity-70">You have {trialInfo.daysLeft} days left in your free founding trial. All features are currently active.</p>
               )}
               {trialInfo?.type === 'beta' && (
                  <p className="text-xs font-medium text-indigo-100 mb-8 opacity-70">Welcome back! As an original Beta Founding Member, you have permanent free access to the OS.</p>
               )}
               <button onClick={() => setActiveTab('billing')} className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest">View Billing Details</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 space-y-8">
          <div className="bg-white rounded-[40px] border border-slate-200 p-12 shadow-sm text-center">
            <h3 className="text-3xl font-black text-slate-900 mb-2">Simple, Fair Pricing.</h3>
            <p className="text-slate-500 font-medium mb-10">We don't do "Lite" versions. Every freelancer deserves the best tools.</p>

            <div className="max-w-xl mx-auto bg-indigo-600 p-10 rounded-[50px] text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-10"><i className="fa-solid fa-crown text-6xl"></i></div>
               <h4 className="text-xl font-black mb-1">FreelanceOS Pro</h4>
               <p className="text-indigo-200 text-xs mb-8">Everything Included</p>
               
               <div className="flex flex-col items-center mb-10">
                  <div className="text-7xl font-black">£4.99<span className="text-lg text-indigo-300">/mo</span></div>
                  <div className="mt-4 px-4 py-2 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-300">
                    3 Months Free Trial Included
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 text-left text-xs font-bold text-indigo-100 mb-10">
                  <div className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> AI Strategic Hub</div>
                  <div className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Cloud Sync</div>
                  <div className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Calendar Automation</div>
                  <div className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> No Ads / No Walls</div>
               </div>

               {trialInfo?.type === 'beta' ? (
                 <div className="w-full py-5 bg-emerald-500 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg">Founding Member — Free for life</div>
               ) : (
                 <button className="w-full py-5 bg-white text-indigo-600 rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-all">Subscribe via Stripe</button>
               )}
            </div>
            
            <p className="mt-8 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Next Payment Due: {trialInfo?.daysLeft === Infinity ? 'Never' : `${trialInfo?.daysLeft} days`}</p>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl">
            <h3 className="text-xl font-black mb-6">Cloud Pulse</h3>
            <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-xs font-bold text-slate-400">Database Engine</span>
                  <span className={`text-[10px] font-black uppercase ${cloudStatus === 'online' ? 'text-emerald-400' : 'text-rose-400'}`}>{cloudStatus}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-xs font-bold text-slate-400">AI Intelligence</span>
                  <span className="text-[10px] font-black text-emerald-400 uppercase">Flash-Native active</span>
                </div>
            </div>
          </div>
          <div className="bg-white rounded-[40px] p-10 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div><h3 className="text-xl font-black text-slate-900 mb-4">Version Info</h3><p className="text-xs font-medium text-slate-500 leading-relaxed">FreelanceOS Beta v3.5. Optimized for high-velocity solo operations. All systems operational.</p></div>
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-8">Build Stable-Beta-Release</p>
          </div>
        </div>
      )}
    </div>
  );
};