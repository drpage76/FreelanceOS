
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
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'localization'>('profile');
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
        companyRegNumber: (formData.get('companyRegNumber') as string) || user?.companyRegNumber || '',
        
        // Banking
        accountName: (formData.get('accountName') as string) || user?.accountName || '',
        accountNumber: (formData.get('accountNumber') as string) || user?.accountNumber || '',
        sortCodeOrIBAN: (formData.get('sortCodeOrIBAN') as string) || user?.sortCodeOrIBAN || '',
        
        // Tax
        isVatRegistered: formData.get('isVatRegistered') === 'on',
        vatNumber: (formData.get('vatNumber') as string) || user?.vatNumber || '',
        taxName: (formData.get('taxName') as string) || user?.taxName || 'VAT',
        taxRate: parseFloat(formData.get('taxRate') as string) || user?.taxRate || 20,
        
        // Localization
        currency: (formData.get('currency') as string) || user?.currency || 'GBP',
        
        // Fiscal Year
        fiscalYearStartDay: parseInt(formData.get('fiscalDay') as string) || user?.fiscalYearStartDay || 6,
        fiscalYearStartMonth: parseInt(formData.get('fiscalMonth') as string) || user?.fiscalYearStartMonth || 4,

        // Invoicing
        invoicePrefix: (formData.get('invoicePrefix') as string) || user?.invoicePrefix || 'INV-',
        invoiceNextNumber: parseInt(formData.get('invoiceNextNumber') as string) || user?.invoiceNextNumber || 1,

        logoUrl: logoPreview
      };
      await DB.updateTenant(updated);
      setSaveSuccess(true);
      onRefresh();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) { } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none italic">Workspace Engine</h2>
          <p className="text-slate-500 font-medium mt-1">Configuring global protocols for {user?.email}</p>
        </div>
        <button onClick={onLogout} className="px-6 py-3 bg-white text-rose-500 border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm">Sign Out</button>
      </header>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        <button onClick={() => setActiveTab('profile')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'profile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Business Profile</button>
        <button onClick={() => setActiveTab('localization')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'localization' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Tax & Localization</button>
        <button onClick={() => setActiveTab('billing')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'billing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Plan</button>
      </div>

      <form onSubmit={handleUpdateProfile} className="space-y-8">
        {activeTab === 'profile' && (
          <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Legal Entity Name</label>
                <input name="businessName" defaultValue={user?.businessName} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Company Reg Number (Optional)</label>
                <input name="companyRegNumber" defaultValue={user?.companyRegNumber} placeholder="e.g. 12345678" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Registered Address (Multi-line)</label>
                <textarea name="businessAddress" defaultValue={user?.businessAddress} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold h-24 outline-none" />
              </div>
              
              {/* Banking Section */}
              <div className="md:col-span-2 pt-4 border-t border-slate-50">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 italic">Remittance & Banking Protocols</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Account Name</label>
                    <input name="accountName" defaultValue={user?.accountName} placeholder="Full Business Name" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Account Number</label>
                    <input name="accountNumber" defaultValue={user?.accountNumber} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Sort Code / IBAN / SWIFT</label>
                    <input name="sortCodeOrIBAN" defaultValue={user?.sortCodeOrIBAN} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm outline-none" />
                  </div>
                </div>
              </div>
            </div>
            <button type="submit" disabled={isSaving} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all">
              {isSaving ? 'Synchronizing...' : 'Update Business Core'}
            </button>
          </div>
        )}

        {activeTab === 'localization' && (
          <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Regional Settings */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Trading Currency</label>
                <select name="currency" defaultValue={user?.currency || 'GBP'} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none">
                  <option value="GBP">GBP - British Pound (£)</option>
                  <option value="USD">USD - US Dollar ($)</option>
                  <option value="EUR">EUR - Euro (€)</option>
                  <option value="AUD">AUD - Australian Dollar ($)</option>
                  <option value="CAD">CAD - Canadian Dollar ($)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Tax Label (VAT/GST/Sales Tax)</label>
                <input name="taxName" defaultValue={user?.taxName || 'VAT'} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
              </div>

              {/* Tax Settings */}
              <div className="md:col-span-2 pt-4 border-t border-slate-50">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 italic">Taxation Configuration</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <input type="checkbox" name="isVatRegistered" defaultChecked={user?.isVatRegistered} className="w-5 h-5 accent-indigo-600" />
                    <span className="text-[10px] font-black text-slate-900 uppercase">Registered for Tax/VAT</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Tax Number / VAT ID</label>
                    <input name="vatNumber" defaultValue={user?.vatNumber} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Default Tax Rate (%)</label>
                    <input type="number" name="taxRate" defaultValue={user?.taxRate || 20} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black outline-none" />
                  </div>
                </div>
              </div>

              {/* Fiscal Year */}
              <div className="md:col-span-2 pt-4 border-t border-slate-50">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 italic">Fiscal Reporting Cycle</h4>
                <div className="flex gap-6 items-center">
                   <div className="flex-1 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase px-1">Start Day</label>
                      <input type="number" name="fiscalDay" defaultValue={user?.fiscalYearStartDay || 6} className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black outline-none border border-slate-200" />
                   </div>
                   <div className="flex-1 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase px-1">Start Month</label>
                      <select name="fiscalMonth" defaultValue={user?.fiscalYearStartMonth || 4} className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black outline-none border border-slate-200">
                         {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                           <option key={m} value={i+1}>{m}</option>
                         ))}
                      </select>
                   </div>
                   <div className="flex-[2] bg-indigo-50 p-4 rounded-2xl border border-indigo-100 italic text-[10px] text-indigo-700 font-bold">
                     Revenue dashboard will reset on the {user?.fiscalYearStartDay}th of {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(user?.fiscalYearStartMonth || 4)-1]} annually.
                   </div>
                </div>
              </div>

              {/* Invoicing Sequence */}
              <div className="md:col-span-2 pt-4 border-t border-slate-50">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 italic">Invoicing Identity & Sequencing</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Invoice Prefix</label>
                    <input name="invoicePrefix" defaultValue={user?.invoicePrefix || 'INV-'} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Next Sequence Number</label>
                    <input type="number" name="invoiceNextNumber" defaultValue={user?.invoiceNextNumber || 1} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                  </div>
                </div>
              </div>
            </div>
            <button type="submit" disabled={isSaving} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all">
              {isSaving ? 'Synchronizing Localization...' : 'Update Localization Protocols'}
            </button>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="max-w-lg mx-auto bg-slate-900 p-10 rounded-[48px] text-white shadow-2xl text-center animate-in fade-in slide-in-from-bottom-2">
             <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-2">Standard Protocol</p>
             <h3 className="text-3xl font-black mb-10 tracking-tighter">FreelanceOS Elite</h3>
             
             <div className="mb-10">
                <div className="text-7xl font-black">£4.99<span className="text-lg text-slate-500">/mo</span></div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-4">
                  Trial Status: {trialInfo?.daysLeft} days remaining (Ends {trialInfo?.expiryDate})
                </p>
             </div>

             <ul className="space-y-4 text-left text-xs font-bold text-slate-400 mb-10">
                <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Smart AI Business Coaching</li>
                <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Global Currency & Tax Engine</li>
                <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Secure Real-time Cloud Backup</li>
                <li className="flex items-center gap-2"><i className="fa-solid fa-check text-emerald-400"></i> Google Calendar Bi-sync</li>
             </ul>

             {user?.plan === UserPlan.ACTIVE ? (
               <div className="w-full py-5 bg-emerald-500 rounded-3xl font-black text-xs uppercase">Subscription Active</div>
             ) : (
               <button type="button" onClick={() => alert("Connecting to Stripe Gateway...")} className="w-full py-5 bg-indigo-600 rounded-3xl font-black text-xs uppercase hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20">Upgrade Lifetime Account</button>
             )}
          </div>
        )}
      </form>
    </div>
  );
};
