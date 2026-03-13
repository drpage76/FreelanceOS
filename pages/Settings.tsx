// src/pages/Settings.tsx
import React, { useEffect, useMemo, useState } from "react";
import { DB } from "../services/db";
import { Tenant, UserPlan, InvoiceNumberingType } from "../types";
import { checkSubscriptionStatus, COUNTRIES, UNIQUE_CURRENCIES } from "../utils";
import { format } from "date-fns";
import { startStripeCheckout, openStripePortal } from "../services/payment";

interface SettingsProps {
  user: Tenant | null;
  onLogout: () => void;
  onRefresh: () => void;
}

type TabKey = "profile" | "billing" | "localization";

export const Settings: React.FC<SettingsProps> = ({ user, onLogout, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ✅ critical: if parent briefly passes null (session blink / refresh timing), still render settings
  const [resolvedUser, setResolvedUser] = useState<Tenant | null>(user);

  // Keep logo in local state (base64)
  const [logoBase64, setLogoBase64] = useState<string | undefined>(user?.logoUrl);

  // Currency auto-helper
  const [currentCurrency, setCurrentCurrency] = useState<string>(user?.currency || "GBP");

  // Keep local state aligned when prop updates
  useEffect(() => {
    setResolvedUser(user);
    setLogoBase64(user?.logoUrl);
    setCurrentCurrency(user?.currency || "GBP");
  }, [user?.email]); // key off email to avoid unnecessary churn

  // ✅ self-heal: if user prop is null but we can fetch tenant, populate it
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (resolvedUser) return;

      try {
        await DB.initializeSession?.();
      } catch {}

      try {
        const u = await DB.getCurrentUser();
        if (!cancelled) {
          setResolvedUser(u);
          setLogoBase64(u?.logoUrl);
          setCurrentCurrency(u?.currency || "GBP");
        }
      } catch (e) {
        // keep spinner
        console.warn("[Settings] getCurrentUser failed:", e);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [resolvedUser]);

  const sub = useMemo(() => checkSubscriptionStatus(resolvedUser), [resolvedUser]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Image too large. Please select a file under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setLogoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const countryName = e.target.value;
    const countryData = COUNTRIES.find((c) => c.name === countryName);
    if (countryData?.currency) {
      setCurrentCurrency(countryData.currency);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resolvedUser) return;

    setIsSaving(true);
    try {
      const formData = new FormData(e.currentTarget);

      const updated: Tenant = {
        ...resolvedUser,

        // Identity
        email: resolvedUser.email,
        name: (formData.get("name") as string) || resolvedUser.name || "",
        businessName: (formData.get("businessName") as string) || resolvedUser.businessName || "",
        businessAddress: (formData.get("businessAddress") as string) || resolvedUser.businessAddress || "",
        companyRegNumber: (formData.get("companyRegNumber") as string) || resolvedUser.companyRegNumber || "",
        country: (formData.get("country") as string) || resolvedUser.country || "United Kingdom",

        // Bank details
        accountName: (formData.get("accountName") as string) || (resolvedUser as any).accountName || "",
        accountNumber: (formData.get("accountNumber") as string) || (resolvedUser as any).accountNumber || "",
        sortCodeOrIBAN: (formData.get("sortCodeOrIBAN") as string) || (resolvedUser as any).sortCodeOrIBAN || "",

        // Tax config
        isVatRegistered: formData.get("isVatRegistered") === "on",
        vatNumber: (formData.get("vatNumber") as string) || resolvedUser.vatNumber || "",
        taxName: (formData.get("taxName") as string) || resolvedUser.taxName || "VAT",
        taxRate: Number.parseFloat(formData.get("taxRate") as string) || resolvedUser.taxRate || 20,

        // Currency
        currency: (formData.get("currency") as string) || resolvedUser.currency || "GBP",

        // Fiscal year
        fiscalYearStartDay: Number.parseInt(formData.get("fiscalDay") as string, 10) || resolvedUser.fiscalYearStartDay || 6,
        fiscalYearStartMonth:
          Number.parseInt(formData.get("fiscalMonth") as string, 10) || resolvedUser.fiscalYearStartMonth || 4,

        // Invoice numbering
        invoicePrefix: (formData.get("invoicePrefix") as string) || resolvedUser.invoicePrefix || "INV-",
        invoiceNextNumber:
          Number.parseInt(formData.get("invoiceNextNumber") as string, 10) || resolvedUser.invoiceNextNumber || 1,
        invoiceNumberingType:
          ((formData.get("invoiceNumberingType") as InvoiceNumberingType) || resolvedUser.invoiceNumberingType || "INCREMENTAL") as any,

        // Logo
        logoUrl: logoBase64,
      };

      await DB.updateTenant(updated);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Re-fetch upstream state (your app uses this)
      await onRefresh();

      // Also refresh our local view (prevents “empty settings” feeling if parent lags)
      setResolvedUser(updated);
    } catch (err) {
      console.error("Profile Update Failed:", err);
      alert("Could not save settings. If this keeps happening, log out + back in and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpgrade = async () => {
    if (!resolvedUser) return;

    setIsUpgrading(true);
    try {
      await startStripeCheckout(resolvedUser.email);
    } catch (e: any) {
      alert(e?.message || "Failed to reach payment gateway. Please check your cloud connection.");
      setIsUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    if (!resolvedUser) return;
    try {
      await openStripePortal(resolvedUser.email);
    } catch {
      alert("Could not open billing portal.");
    }
  };

  if (!resolvedUser) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20 px-4">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none">
            Settings
          </h2>
          <p className="text-xs font-black text-slate-500 tracking-widest">
            {resolvedUser.email}
          </p>
        </div>

        <div className="flex gap-3 items-center">
          {saveSuccess && (
            <span className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-xs font-black flex items-center animate-in fade-in zoom-in-95">
              <i className="fa-solid fa-check mr-2" /> Synced
            </span>
          )}
          <button
            onClick={onLogout}
            className="px-6 py-3 bg-white text-rose-500 border border-slate-200 rounded-xl font-black text-xs tracking-widest shadow-sm"
            type="button"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-6 py-3 rounded-xl text-xs font-black tracking-widest transition-all ${
              activeTab === "profile" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
            }`}
            type="button"
          >
            Business Profile
          </button>
          <button
            onClick={() => setActiveTab("localization")}
            className={`px-6 py-3 rounded-xl text-xs font-black tracking-widest transition-all ${
              activeTab === "localization" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
            }`}
            type="button"
          >
            Tax & Localization
          </button>
          <button
            onClick={() => setActiveTab("billing")}
            className={`px-6 py-3 rounded-xl text-xs font-black tracking-widest transition-all ${
              activeTab === "billing" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
            }`}
            type="button"
          >
            Billing & Subscription
          </button>
        </div>
      </div>

      {activeTab === "billing" ? (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-900 p-10 rounded-[48px] text-white shadow-2xl flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
                <i className="fa-solid fa-gem text-9xl" />
              </div>

              <div>
                <p className="text-indigo-400 text-xs font-black tracking-widest mb-2">
                  Simple Pricing. Full Access.
                </p>
                <h3 className="text-4xl font-black mb-10 tracking-tighter">
                  FreelanceOS <span className="text-indigo-500">ELITE</span>
                </h3>

                <div className="mb-10">
                  <div className="text-7xl font-black tracking-tighter">
                    £11.99<span className="text-lg text-slate-500">/mo</span>
                  </div>
                  <p className="text-xs text-slate-900 tracking-widest mt-4">
                    
                  </p>
                </div>

                <ul className="space-y-4 text-left text-xs font-bold text-slate-900 mb-10">
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
                      <i className="fa-solid fa-check text-xs" />
                    </div>
                    Managed by PageTech Creative Ltd
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
                      <i className="fa-solid fa-check text-xs" />
                    </div>
                    Enterprise Cloud Mirroring
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
                      <i className="fa-solid fa-check text-xs" />
                    </div>
                    Automated Google Maps Mileage Engine
                  </li>
                </ul>
              </div>

              {resolvedUser.plan !== UserPlan.ACTIVE ? (
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={isUpgrading}
                  className={`w-full py-5 rounded-3xl font-black text-xs transition-all shadow-xl flex items-center justify-center gap-3 ${
                    sub.isTrialExpired
                      ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20"
                      : "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                  }`}
                >
                  {isUpgrading ? (
                    <i className="fa-solid fa-spinner animate-spin" />
                  ) : (
                    <i className="fa-solid fa-shield-check" />
                  )}
                  {isUpgrading
                    ? "Redirecting to Stripe..."
                    : sub.isTrialExpired
                    ? "Pay to Reactivate Elite"
                    : "Add Payment for Auto-Billing"}
                </button>
              ) : (
                <div className="w-full py-5 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl font-black text-xs text-emerald-400 text-center tracking-widest">
                  <i className="fa-solid fa-check-double mr-2" /> Elite Active
                </div>
              )}
            </div>

            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-slate-900 tracking-widest mb-6">
                  Subscription Status
                </h4>

                <div className="space-y-8">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-black text-slate-900 tracking-widest mb-1">
                        Active Plan
                      </p>
                      <p className="font-black text-slate-900 text-lg">FreelanceOS Elite</p>
                    </div>

                    <span
                      className={`px-4 py-1.5 rounded-full text-[9px] font-black border ${
                        resolvedUser.plan === UserPlan.ACTIVE
                          ? "bg-indigo-50 text-indigo-600 border-indigo-100"
                          : "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
                      }`}
                    >
                      {resolvedUser.plan === UserPlan.ACTIVE ? "Operational" : "On Trial"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-black text-slate-900 tracking-widest mb-2">
                      Trial Time Remaining
                    </p>

                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-100">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-1000"
                        style={{
                          width: `${Math.min(
                            100,
                            (((30 - (sub?.daysLeft || 0)) / 30) * 100)
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="flex justify-between mt-3 gap-3">
                      <p className="text-xs font-bold text-slate-500">
                        {sub?.daysLeft ?? 0} days remaining
                      </p>
                      <p className="text-xs font-black text-slate-900 text-right">
                        Billing Starts{" "}
                        {sub?.expiryDate ? format(sub.expiryDate, "dd MMM yyyy") : "TBD"}
                      </p>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-slate-50">
                    <p className="text-[9px] text-slate-900 font-bold leading-relaxed mb-6">
                      FreelanceOS is designed to be part of your real workflow. By adding a payment method,
                      you ensure uninterrupted service when the 30-day trial ends. All billing managed by
                      PageTech Solutions Ltd.
                    </p>

                    <button
                      type="button"
                      onClick={handleManageBilling}
                      className="w-full py-4 bg-slate-50 text-slate-600 border border-slate-200 rounded-2xl font-black text-xs tracking-widest hover:bg-slate-100 transition-all"
                    >
                      Access Stripe Billing Portal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleUpdateProfile} className="space-y-8">
          {activeTab === "profile" && (
            <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                    Legal Entity Name
                  </label>
                  <input
                    name="name"
                    defaultValue={resolvedUser?.name}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                    Trading Name
                  </label>
                  <input
                    name="businessName"
                    defaultValue={resolvedUser?.businessName}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                    Operating Country
                  </label>
                  <select
                    name="country"
                    defaultValue={resolvedUser?.country || "United Kingdom"}
                    onChange={handleCountryChange}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none custom-scrollbar"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 space-y-4">
                  <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                    Business Logo
                  </label>

                  <div className="flex flex-col md:flex-row gap-6 items-center bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                    <div className="w-32 h-32 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                      {logoBase64 ? (
                        <img src={logoBase64} alt="Company Logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <i className="fa-solid fa-image text-slate-200 text-3xl" />
                      )}
                    </div>

                    <div className="flex-1 space-y-2 text-center md:text-left">
                      <p className="text-xs font-bold text-slate-900">Upload business identity logo</p>
                      <p className="text-xs text-slate-500">
                        Supports PNG, JPG (Max 2MB). Visible on all professional documents.
                      </p>

                      <div className="pt-2">
                        <label className="cursor-pointer bg-white border border-slate-200 px-6 py-2.5 rounded-xl text-xs font-black tracking-widest inline-block shadow-sm hover:border-indigo-400 transition-colors">
                          Select File
                          <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                        </label>

                        {logoBase64 && (
                          <button
                            type="button"
                            onClick={() => setLogoBase64(undefined)}
                            className="ml-4 text-xs font-black text-rose-500 tracking-widest"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                    Company Reg Number (Optional)
                  </label>
                  <input
                    name="companyRegNumber"
                    defaultValue={resolvedUser?.companyRegNumber}
                    placeholder="e.g. 12345678"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                    Registered Address (Multi-line)
                  </label>
                  <textarea
                    name="businessAddress"
                    defaultValue={resolvedUser?.businessAddress}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold h-24 outline-none"
                  />
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-50">
                  <h4 className="text-xs font-black text-slate-900 tracking-widest mb-6">
                    Financial Remittance Protocols
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                        Account Name
                      </label>
                      <input
                        name="accountName"
                        defaultValue={(resolvedUser as any)?.accountName}
                        placeholder="Full Business Name"
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                        Account Number
                      </label>
                      <input
                        name="accountNumber"
                        defaultValue={(resolvedUser as any)?.accountNumber}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                        Sort Code / IBAN / SWIFT
                      </label>
                      <input
                        name="sortCodeOrIBAN"
                        defaultValue={(resolvedUser as any)?.sortCodeOrIBAN}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs tracking-widest shadow-xl hover:bg-black transition-all"
              >
                {isSaving ? "Synchronizing Business Core..." : "Sync Business Identity"}
              </button>
            </div>
          )}

          {activeTab === "localization" && (
            <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                    Trading Currency
                  </label>
                  <select
                    name="currency"
                    key={currentCurrency}
                    defaultValue={currentCurrency}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none custom-scrollbar"
                  >
                    {UNIQUE_CURRENCIES.map((curr) => (
                      <option key={curr} value={curr}>
                        {curr}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                    Tax Label (VAT/GST/Sales Tax)
                  </label>
                  <input
                    name="taxName"
                    defaultValue={resolvedUser?.taxName || "VAT"}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                  />
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-50">
                  <h4 className="text-xs font-black text-slate-900 tracking-widest mb-6">
                    Taxation Configuration
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                      <input
                        type="checkbox"
                        name="isVatRegistered"
                        defaultChecked={!!resolvedUser?.isVatRegistered}
                        className="w-5 h-5 accent-indigo-600"
                      />
                      <span className="text-xs font-black text-slate-900">
                        Registered for Tax/VAT
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                        Tax Number / VAT ID
                      </label>
                      <input
                        name="vatNumber"
                        defaultValue={resolvedUser?.vatNumber || ""}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                        Default Tax Rate (%)
                      </label>
                      <input
                        type="number"
                        name="taxRate"
                        defaultValue={resolvedUser?.taxRate ?? 20}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-black outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-50">
                  <h4 className="text-xs font-black text-slate-900 tracking-widest mb-6">
                    Fiscal Reporting Cycle
                  </h4>

                  <div className="flex gap-6 items-center">
                    <div className="flex-1 space-y-1">
                      <label className="text-[9px] font-black text-slate-900 px-1">
                        Start Day
                      </label>
                      <input
                        type="number"
                        name="fiscalDay"
                        defaultValue={resolvedUser?.fiscalYearStartDay ?? 6}
                        className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black outline-none border border-slate-200"
                      />
                    </div>

                    <div className="flex-1 space-y-1">
                      <label className="text-[9px] font-black text-slate-900 px-1">
                        Start Month
                      </label>
                      <select
                        name="fiscalMonth"
                        defaultValue={resolvedUser?.fiscalYearStartMonth ?? 4}
                        className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black outline-none border border-slate-200"
                      >
                        {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                          <option key={m} value={i + 1}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-slate-50">
                  <h4 className="text-xs font-black text-slate-900 tracking-widest mb-6">
                    Invoicing Identity & Sequencing
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                        Numbering Logic
                      </label>
                      <select
                        name="invoiceNumberingType"
                        defaultValue={(resolvedUser?.invoiceNumberingType as any) || "INCREMENTAL"}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[11px] outline-none"
                      >
                        <option value="INCREMENTAL">Incremental (e.g. INV-0042)</option>
                        <option value="DATE_BASED">Date-based (e.g. 250301)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                        Prefix (Incremental only)
                      </label>
                      <input
                        name="invoicePrefix"
                        defaultValue={resolvedUser?.invoicePrefix || "INV-"}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-900 block tracking-widest px-1">
                        Next sequence number
                      </label>
                      <input
                        type="number"
                        name="invoiceNextNumber"
                        defaultValue={resolvedUser?.invoiceNextNumber ?? 1}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs tracking-widest shadow-xl hover:bg-black transition-all"
              >
                {isSaving ? "Synchronizing Localization..." : "Update Localization Protocols"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default Settings;