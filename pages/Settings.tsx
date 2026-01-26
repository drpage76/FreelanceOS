
import React, { useState, useEffect } from 'react';
import { DB } from '../services/db';
import { Tenant, UserPlan, JobStatus, InvoiceStatus } from '../types';

interface SettingsProps {
  user: Tenant | null;
  onLogout: () => void;
  onRefresh: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, onLogout, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'system'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | undefined>(user?.logoUrl);
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const checkCloud = async () => {
    setCloudStatus('checking');
    setErrorMsg(null);
    const result = await DB.testConnection();
    setCloudStatus(result.success ? 'online' : 'offline');
    onRefresh();
  };

  useEffect(() => {
    checkCloud();
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const formData = new FormData(e.currentTarget);
      const updated: Tenant = {
        email: user?.email || '',
        name: (formData.get('name') as string) || user?.name || '',
        businessName: (formData.get('businessName') as string) || user?.businessName || '',
        businessAddress: (formData.get('businessAddress') as string) || user?.businessAddress || '',
        bankDetails: (formData.get('bankDetails') as string) || user?.bankDetails || '',
        logoUrl: logoPreview,
        plan: user?.plan || UserPlan.FREE,
        isVatRegistered: formData.get('isVat') === 'on',
        vatNumber: (formData.get('vatNumber') as string) || ''
      };
      await DB.updateTenant(updated);
      setSaveSuccess(true);
      onRefresh();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) { 
      setErrorMsg(err.message);
    } finally { setIsSaving(false); }
  };

  const handleUpgrade = (plan: string) => {
    // Placeholder for Stripe Checkout Integration
    alert(`Redirecting to Stripe Checkout for ${plan} ${billingCycle}...`);
  };

  const copyAdoptionScript = () => {
    const email = user?.email || 'your@email.com';
    const sql = `-- SECURITY & MULTI-USER SYNC
ALTER TABLE IF EXISTS jobs ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE IF EXISTS jobs ADD COLUMN IF NOT EXISTS scheduling_type TEXT DEFAULT 'Continuous';
CREATE TABLE IF NOT EXISTS job_shifts (id UUID PRIMARY KEY, job_id TEXT, title TEXT, start_date DATE, end_date DATE, start_time TIME, end_time TIME, is_full_day BOOLEAN DEFAULT FALSE, tenant_id TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());
ALTER TABLE job_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_isolation" ON job_shifts FOR ALL USING (tenant_id = (auth.jwt() ->> 'email'));
UPDATE clients SET tenant_id = '${email}' WHERE tenant_id IS NULL;`;
    navigator.clipboard.writeText(sql);
    alert("Script copied!");
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20 px-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Account Control</h2>
          <p className="text-slate-500 font-medium">Manage your professional presence and cloud subscription.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onLogout} className="px-6 py-3 text-slate-400 hover:text-rose-600 font-black text-[10px] uppercase tracking-widest transition-all">
            Sign Out
          </button>
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
          <div className="lg:col-span-8 space-y-8">
            <form onSubmit={handleUpdateProfile} className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm space-y-12">
              <div className="flex flex-col md:flex-row gap-8 items-center p-8 bg-slate-50 rounded-[32px] border border-slate-100">
                 <div className="w-40 h-40 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shadow-inner group relative">
                   {logoPreview ? (
                     <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
                   ) : (
                     <div className="text-center p-4">
                        <i className="fa-solid fa-image text-slate-200 text-3xl mb-2"></i>
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Brand Logo</p>
                     </div>
                   )}
                   <input type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                 </div>
                 <div className="flex-1 space-y-2">
                   <h4 className="font-black text-slate-900 text-lg">Branding Identity</h4>
                   <p className="text-xs font-bold text-slate-500 leading-relaxed">Your logo will appear on all client-facing invoices and PDFs.</p>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Legal Representative</label>
                  <input name="name" defaultValue={user?.name} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Trading Name</label>
                  <input name="businessName" defaultValue={user?.businessName} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Business Registered Address</label>
                  <textarea name="businessAddress" defaultValue={user?.businessAddress} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none h-32 custom-scrollbar" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block px-1">Remittance Details (Bank/IBAN)</label>
                  <input name="bankDetails" defaultValue={user?.bankDetails} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm outline-none" placeholder="Sort Code: 00-00-00, Account: 00000000" />
                </div>
              </div>

              <button type="submit" disabled={isSaving} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-sm uppercase shadow-2xl hover:bg-black transition-all">
                {isSaving ? 'Synchronizing...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
          <div className="lg:col-span-4 bg-indigo-600 p-8 rounded-[40px] text-white shadow-2xl h-fit">
             <h3 className="text-xl font-black mb-4">Active Plan</h3>
             <div className="bg-white/10 border border-white/20 p-6 rounded-3xl mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Tier</p>
                <p className="text-2xl font-black">{user?.plan || 'Free Member'}</p>
             </div>
             <p className="text-xs font-medium text-indigo-100 leading-relaxed mb-8 opacity-70">
               Your account is currently {user?.plan === UserPlan.FREE ? 'limited to local data' : 'active with full cloud synchronization'}.
             </p>
             <button onClick={() => setActiveTab('billing')} className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">Manage Billing</button>
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 space-y-8">
          <div className="bg-white rounded-[40px] border border-slate-200 p-12 shadow-sm text-center">
            <h3 className="text-3xl font-black text-slate-900 mb-2">Choose Your Scale</h3>
            <p className="text-slate-500 font-medium mb-10">Professional tools for the solo-powerhouse.</p>

            <div className="flex items-center justify-center gap-4 mb-12">
              <span className={`text-[10px] font-black uppercase tracking-widest ${billingCycle === 'monthly' ? 'text-slate-900' : 'text-slate-400'}`}>Monthly</span>
              <button onClick={() => setBillingCycle(prev => prev === 'monthly' ? 'yearly' : 'monthly')} className={`w-14 h-8 rounded-full transition-all relative ${billingCycle === 'yearly' ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${billingCycle === 'yearly' ? 'left-7' : 'left-1'}`} />
              </button>
              <span className={`text-[10px] font-black uppercase tracking-widest ${billingCycle === 'yearly' ? 'text-slate-900' : 'text-slate-400'}`}>Yearly <span className="text-emerald-500">(20% OFF)</span></span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Free Plan */}
              <div className="bg-slate-50 border border-slate-200 p-8 rounded-[32px] flex flex-col items-center text-left">
                <h4 className="text-lg font-black text-slate-900 mb-1 self-start">Lite</h4>
                <p className="text-slate-500 text-xs mb-6 self-start">Essential for freelancers.</p>
                <div className="text-4xl font-black mb-8">£0 <span className="text-xs font-bold text-slate-400">/ forever</span></div>
                <ul className="space-y-4 mb-10 w-full text-xs font-bold text-slate-600">
                  <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-500"></i> Full Invoicing & Quotes</li>
                  <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-500"></i> Expense & Mileage Tracking</li>
                  <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-500"></i> Local Data Records</li>
                  <li className="flex items-center gap-2"><i className="fa-solid fa-xmark text-rose-300"></i> Cloud Sync & Multi-Device</li>
                </ul>
                <button disabled className="w-full py-4 bg-slate-200 text-slate-400 rounded-2xl font-black text-[10px] uppercase cursor-not-allowed">Active Plan</button>
              </div>

              {/* Pro Plan */}
              <div className="bg-indigo-600 border border-indigo-700 p-8 rounded-[32px] flex flex-col items-center text-left text-white shadow-2xl shadow-indigo-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 bg-white/10 rounded-bl-3xl">
                  <i className="fa-solid fa-bolt text-indigo-300"></i>
                </div>
                <h4 className="text-lg font-black mb-1 self-start">Business Pro</h4>
                <p className="text-indigo-200 text-xs mb-6 self-start">Full power cloud business hub.</p>
                <div className="text-4xl font-black mb-8">
                  {billingCycle === 'monthly' ? '£19' : '£15'}<span className="text-xs font-bold text-indigo-300"> / month</span>
                </div>
                <ul className="space-y-4 mb-10 w-full text-xs font-bold text-indigo-100">
                  <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Unlimited Cloud Sync</li>
                  <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Gemini AI Strategy Hub</li>
                  <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Google Maps Intelligence</li>
                  <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Smart Calendar Integration</li>
                </ul>
                <button onClick={() => handleUpgrade('Pro')} className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:scale-[1.02] transition-all">Upgrade Now</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl border border-slate-700">
            <h3 className="text-xl font-black mb-6 flex items-center gap-3">
              <i className="fa-solid fa-microchip text-indigo-400"></i> 
              Dev Intelligence
            </h3>
            <div className="space-y-6">
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Realign ownership of records if you shifted from local to multi-user cloud recently.
              </p>
              <button onClick={copyAdoptionScript} className="w-full py-4 bg-white/10 text-indigo-400 border border-indigo-400/20 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">
                Copy Adoption Script
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[40px] p-10 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-900 mb-4">Infrastructure</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-xs font-bold text-slate-500">Node Engine</span>
                  <span className="text-[10px] font-black text-slate-900 uppercase">React 19 / Vite</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-xs font-bold text-slate-500">Database</span>
                  <span className="text-[10px] font-black text-indigo-600 uppercase">Supabase Cloud</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <span className="text-xs font-bold text-slate-500">AI Core</span>
                  <span className="text-[10px] font-black text-emerald-600 uppercase">Gemini 3.0 Flash</span>
                </div>
              </div>
            </div>
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-8">Build v3.0.4-stable</p>
          </div>
        </div>
      )}
    </div>
  );
};
