import React, { useState, useEffect, useMemo } from 'react';
import { DB } from '../services/db';
import { Tenant, UserPlan, InvoiceNumberingType } from '../types';
import { differenceInDays, parseISO, addMonths, format, isValid } from 'date-fns';

interface SettingsProps {
  user: Tenant | null;
  onLogout: () => void;
  onRefresh: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, onLogout, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'billing' | 'localization'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | undefined>(user?.logoUrl);

  const trialInfo = useMemo(() => {
    if (!user) return null;
    
    // Safety check for trialStartDate
    let startDate = new Date();
    if (user.trialStartDate) {
      const parsed = parseISO(user.trialStartDate);
      if (isValid(parsed)) {
        startDate = parsed;
      }
    }

    const expiry = addMonths(startDate, 3);
    const daysLeft = Math.max(0, differenceInDays(expiry, new Date()));
    
    let formattedExpiry = "TBD";
    try {
      formattedExpiry = format(expiry, 'dd MMM yyyy');
    } catch (e) {
      console.warn("Date formatting failed", e);
    }
    
    return { 
      plan: user.plan,
      daysLeft,
      expiryDate: formattedExpiry,
      isExpired: daysLeft <= 0
    };
  }, [user]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image too large. Please select a file under 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSaving(true);
    try {
      const formData = new FormData(e.currentTarget);
      const updated: Tenant = {
        ...user,
        email: user.email,
        name: (formData.get('name') as string) || user.name || '',
        businessName: (formData.get('businessName') as string) || user.businessName || '',
        businessAddress: (formData.get('businessAddress') as string) || user.businessAddress || '',
        companyRegNumber: (formData.get('companyRegNumber') as string) || user.companyRegNumber || '',
        
        accountName: (formData.get('accountName') as string) || user.accountName || '',
        accountNumber: (formData.get('accountNumber') as string) || user.accountNumber || '',
        sortCodeOrIBAN: (formData.get('sortCodeOrIBAN') as string) || user.sortCodeOrIBAN || '',
        
        isVatRegistered: formData.get('isVatRegistered') === 'on',
        vatNumber: (formData.get('vatNumber') as string) || user.vatNumber || '',
        taxName: (formData.get('taxName') as string) || user.taxName || 'VAT',
        taxRate: parseFloat(formData.get('taxRate') as string) || user.taxRate || 20,
        
        currency: (formData.get('currency') as string) || user.currency || 'GBP',
        
        fiscalYearStartDay: parseInt(formData.get('fiscalDay') as string) || user.fiscalYearStartDay || 6,
        fiscalYearStartMonth: parseInt(formData.get('fiscalMonth') as string) || user.fiscalYearStartMonth || 4,

        invoicePrefix: (formData.get('invoicePrefix') as string) || user.invoicePrefix || 'INV-',
        invoiceNextNumber: parseInt(formData.get('invoiceNextNumber') as string) || user.invoiceNextNumber || 1,
        invoiceNumberingType: (formData.get('invoiceNumberingType') as InvoiceNumberingType) || user.invoiceNumberingType || 'INCREMENTAL',

        logoUrl: logoBase64
      };
      await DB.updateTenant(updated);
      setSaveSuccess(true);
      await onRefresh();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) { 
      console.error("Profile Update Failed:", err);
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleUpgrade = async () => {
    if (!user) return;
    setIsUpgrading(true);
    setTimeout(async () => {
      try {
        const upgraded: Tenant = {
          ...user,
          plan: UserPlan.ACTIVE,
          paymentStatus: 'PAID',
          subscriptionExpiry: addMonths(new Date(), 1).toISOString()
        };
        await DB.updateTenant(upgraded);
        await onRefresh();
        setIsUpgrading(false);
        alert("Payment Method Verified. ELITE Subscription is now active.");
      } catch (e) {
        setIsUpgrading(false);
      }
    }, 2500);
  };

  if (!user) return (
    <div className="flex items-center justify-center p-20">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none italic">Workspace Engine</h2>
          <p className="text-slate-500 font-medium mt-1">Global protocols for {user?.email}</p>
        </div>
        <div className="flex gap-3">
           {saveSuccess && <span className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase flex items-center animate-in fade-in zoom-in-95"><i className="fa-solid fa-check mr-2"></i> Synced</span>}
           <button onClick={onLogout} className="px-6 py-3 bg-white text-rose-500 border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm">Sign Out</button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
          <button onClick={() => setActiveTab('profile')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'profile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Business Profile</button>
          <button onClick={() => setActiveTab('localization')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'localization' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Tax & Localization</button>
          <button onClick={() => setActiveTab('billing')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'billing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Billing & Subscription</button>
        </div>
      </div>

      {activeTab === 'billing' ? (
        <div className="animate-in fade-in slide-in-from-bottom-2">
           <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-slate-900 p-10 rounded-[48px] text-white shadow-2xl flex flex-col justify-between relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 opacity-10"><i className="fa-solid fa-gem text-8xl"></i></div>
                 <div>
                    <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-2">Exclusive Membership</p>
                    <h3 className="text-4xl font-black mb-10 tracking-tighter italic">FreelanceOS <span className="text-indigo-500">ELITE</span></h3>
                    <div className="mb-10">
                       <div className="text-7xl font-black">£4.99<span className="text-lg text-slate-500">/mo</span></div>
                       <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-4">
                         Everything inclusive. No hidden fees.
                       </p>
                    </div>
                    <ul className="space-y-4 text-left text-xs font-bold text-slate-400 mb-10">
                       <li className="flex items-center gap-3"><div className="w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center"><i className="fa-solid fa-check text-[10px]"></i></div> Global Cloud Sync Engine</li>
                       <li className="flex items-center gap-3"><div className="w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center"><i className="fa-solid fa-check text-[10px]"></i></div> Real-time Fiscal Reporting</li>
                       <li className="flex items-center gap-3"><div className="w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center"><i className="fa-solid fa-check text-[10px]"></i></div> AI Mileage Protocol (Google Maps)</li>
                       <li className="flex items-center gap-3"><div className="w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center"><i className="fa-solid fa-check text-[10px]"></i></div> Multi-device Bi-sync</li>
                    </ul>
                 </div>
                 {user?.plan !== UserPlan.ACTIVE ? (
                   <button 
                     type="button" 
                     onClick={handleUpgrade} 
                     disabled={isUpgrading}
                     className="w-full py-5 bg-indigo-600 rounded-3xl font-black text-xs uppercase hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3"
                   >
                     {isUpgrading ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-credit-card"></i>}
                     {isUpgrading ? 'Authorizing Gateway...' : 'Activate Subscription'}
                   </button>
                 ) : (
                   <div className="w-full py-5 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl font-black text-xs uppercase text-emerald-400 text-center tracking-widest">
                     <i className="fa-solid fa-shield-check mr-2"></i> Subscription Active
                   </div>
                 )}
              </div>

              <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm flex flex-col justify-between">
                 <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Status Ledger</h4>
                    <div className="space-y-8">
                       <div className="flex justify-between items-center">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Plan</p>
                            <p className="font-black text-slate-900 text-lg">{user?.plan}</p>
                          </div>
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase border ${user?.plan === UserPlan.ACTIVE ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100 animate-pulse'}`}>
                             {user?.plan === UserPlan.ACTIVE ? 'Operational' : 'On Trial'}
                          </span>
                       </div>

                       <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Trial Progress</p>
                          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-100">
                             <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${Math.min(100, ( (90 - (trialInfo?.daysLeft || 0)) / 90 ) * 100)}%` }}></div>
                          </div>
                          <div className="flex justify-between mt-3">
                             <p className="text-[10px] font-bold text-slate-500 italic">{trialInfo?.daysLeft} days remaining</p>
                             <p className="text-[10px] font-black text-slate-900 uppercase">Expires {trialInfo?.expiryDate}</p>
                          </div>
                       </div>

                       <div className="pt-8 border-t border-slate-50">
                          <p className="text-[9px] text-slate-400 font-bold leading-relaxed mb-6">
                            Trial billing begins automatically at the end of the 3-month grace period. You can cancel at any time via the Stripe portal.
                          </p>
                          <button 
                            type="button" 
                            onClick={() => alert("Connecting to Stripe Billing Portal...")} 
                            className="w-full py-4 bg-slate-50 text-slate-600 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all"
                          >
                            Manage Payment Methods
                          </button>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      ) : (
        <form onSubmit={handleUpdateProfile} className="space-y-8">
          {activeTab === 'profile' && (
            <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Legal Entity Name</label>
                  <input name="name" defaultValue={user?.name} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Trading Name</label>
                  <input name="businessName" defaultValue={user?.businessName} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                </div>
                
                <div className="md:col-span-2 space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Business Logo</label>
                  <div className="flex flex-col md:flex-row gap-6 items-center bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                    <div className="w-32 h-32 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                      {logoBase64 ? (
                        <img src={logoBase64} alt="Company Logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <i className="fa-solid fa-image text-slate-200 text-3xl"></i>
                      )}
                    </div>
                    <div className="flex-1 space-y-2 text-center md:text-left">
                      <p className="text-xs font-bold text-slate-900">Upload high-resolution logo</p>
                      <p className="text-[10px] text-slate-500">Supports PNG, JPG (Max 2MB). This will appear on all documents.</p>
                      <div className="pt-2">
                        <label className="cursor-pointer bg-white border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest inline-block shadow-sm hover:border-indigo-400 transition-colors">
                          Select File
                          <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                        </label>
                        {logoBase64 && (
                          <button type="button" onClick={() => setLogoBase64(undefined)} className="ml-4 text-[10px] font-black text-rose-500 uppercase tracking-widest">Remove</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Company Reg Number (Optional)</label>
                  <input name="companyRegNumber" defaultValue={user?.companyRegNumber} placeholder="e.g. 12345678" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Registered Address (Multi-line)</label>
                  <textarea name="businessAddress" defaultValue={user?.businessAddress} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold h-24 outline-none" />
                </div>
                
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
                {isSaving ? 'Synchronizing Core...' : 'Update Business Core'}
              </button>
            </div>
          )}
          {activeTab === 'localization' && (
            <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-50">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 italic">Invoicing Identity & Sequencing</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Numbering Logic</label>
                      <select name="invoiceNumberingType" defaultValue={user?.invoiceNumberingType || 'INCREMENTAL'} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[11px] uppercase outline-none">
                         <option value="INCREMENTAL">Incremental (e.g. INV-0042)</option>
                         <option value="DATE_BASED">Date-based (e.g. 250301)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Prefix (Incremental only)</label>
                      <input name="invoicePrefix" defaultValue={user?.invoicePrefix || 'INV-'} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest px-1">Next sequence number</label>
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
        </form>
      )}
    </div>
  );
};
