import React, { useState, useMemo } from "react";
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

export const Settings: React.FC<SettingsProps> = ({ user, onLogout, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<"profile" | "billing" | "localization">("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | undefined>(user?.logoUrl);

  // Local currency state for auto-updates when country changes
  const [currentCurrency, setCurrentCurrency] = useState(user?.currency || "GBP");

  const sub = useMemo(() => checkSubscriptionStatus(user), [user]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image too large. Please select a file under 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setLogoBase64(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const countryName = e.target.value;
    const countryData = COUNTRIES.find((c) => c.name === countryName);
    if (countryData) setCurrentCurrency(countryData.currency);
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
        name: (formData.get("name") as string) || user.name || "",
        businessName: (formData.get("businessName") as string) || user.businessName || "",
        businessAddress: (formData.get("businessAddress") as string) || user.businessAddress || "",
        companyRegNumber: (formData.get("companyRegNumber") as string) || user.companyRegNumber || "",
        country: (formData.get("country") as string) || user.country || "United Kingdom",

        accountName: (formData.get("accountName") as string) || user.accountName || "",
        accountNumber: (formData.get("accountNumber") as string) || user.accountNumber || "",
        sortCodeOrIBAN: (formData.get("sortCodeOrIBAN") as string) || user.sortCodeOrIBAN || "",

        isVatRegistered: formData.get("isVatRegistered") === "on",
        vatNumber: (formData.get("vatNumber") as string) || user.vatNumber || "",
        taxName: (formData.get("taxName") as string) || user.taxName || "VAT",
        taxRate: parseFloat(formData.get("taxRate") as string) || user.taxRate || 20,

        currency: (formData.get("currency") as string) || user.currency || "GBP",

        fiscalYearStartDay: parseInt(formData.get("fiscalDay") as string) || user.fiscalYearStartDay || 6,
        fiscalYearStartMonth: parseInt(formData.get("fiscalMonth") as string) || user.fiscalYearStartMonth || 4,

        invoicePrefix: (formData.get("invoicePrefix") as string) || user.invoicePrefix || "INV-",
        invoiceNextNumber: parseInt(formData.get("invoiceNextNumber") as string) || user.invoiceNextNumber || 1,
        invoiceNumberingType:
          ((formData.get("invoiceNumberingType") as InvoiceNumberingType) || user.invoiceNumberingType || "INCREMENTAL"),

        logoUrl: logoBase64,
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
    try {
      await startStripeCheckout(user.email);
    } catch (e: any) {
      setIsUpgrading(false);
      alert(e.message || "Failed to reach payment gateway. Please check your cloud connection.");
    }
  };

  const handleManageBilling = async () => {
    if (!user) return;
    try {
      await openStripePortal(user.email);
    } catch (e) {
      alert("Could not open billing portal.");
    }
  };

  if (!user)
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20 px-4">
      {/* (the rest of your JSX stays exactly the same as you pasted) */}
      {/* Keep your existing content below this point unchanged */}
      {/* --- */}
      {/* NOTE: I’m not re-pasting the entire massive JSX again unless you want it — */}
      {/* your logic was fine; this file is mainly cleanup, not a crash-fix. */}
      {/* --- */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none italic">Workspace Engine</h2>
          <p className="text-slate-500 font-medium mt-1">Operational configuration for {user?.email}</p>
        </div>
        <div className="flex gap-3">
          {saveSuccess && (
            <span className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase flex items-center animate-in fade-in zoom-in-95">
              <i className="fa-solid fa-check mr-2"></i> Synced
            </span>
          )}
          <button
            onClick={onLogout}
            className="px-6 py-3 bg-white text-rose-500 border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* keep your remaining JSX exactly as-is */}
      {/* ... */}
      {/* For safety, do NOT change your billing/profile forms until the blank screen is gone. */}
    </div>
  );
};