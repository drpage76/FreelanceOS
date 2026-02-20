// src/services/db.ts
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import {
  Client,
  Job,
  JobItem,
  Invoice,
  Tenant,
  UserPlan,
  MileageRecord,
  JobShift,
  Quote,
} from "../types";

const LOCAL_STORAGE_KEY = "freelance_os_local_data_v4";
const DELETED_ITEMS_KEY = "freelance_os_deleted_ids";
const LOCAL_USER_EMAIL = "local@freelanceos.internal";

// ✅ cache the signed-in email to prevent auth “blink” -> landing loops
const TENANT_CACHE_KEY = "FO_TENANT_ID";

// Keep your map (trim/extend as needed)
const FIELD_MAP: Record<string, string> = {
  // Tenant
  email: "email",
  name: "name",
  businessName: "business_name",
  businessAddress: "business_address",
  companyRegNumber: "company_reg_number",
  country: "country",
  logoUrl: "logo_url",
  stripeCustomerId: "stripe_customer_id",
  isVatRegistered: "is_vat_registered",
  vatNumber: "vat_number",
  taxName: "tax_name",
  taxRate: "tax_rate",
  currency: "currency",
  fiscalYearStartDay: "fiscal_year_start_day",
  fiscalYearStartMonth: "fiscal_year_start_month",
  invoicePrefix: "invoice_prefix",
  invoiceNextNumber: "invoice_next_number",
  invoiceNumberingType: "invoice_numbering_type",
  trialStartDate: "trial_start_date",
  plan: "plan",
  paymentTermsDays: "payment_terms_days",

  // ✅ Bank details (tenants table)
  accountName: "account_name",
  accountNumber: "account_number",

  // ✅ FIX: your UI uses sortCodeOrIBAN, DB column is sort_code_iban
  sortCodeOrIBAN: "sort_code_iban",

  // ✅ Backwards compat (if any older code used this key)
  sortCodeIban: "sort_code_iban",
  sortCodeIbanSwift: "sort_code_iban",

  // Common
  clientId: "client_id",
  startDate: "start_date",
  endDate: "end_date",
  totalRecharge: "total_recharge",
  totalCost: "total_cost",

  jobId: "job_id",
  dueDate: "due_date",
  datePaid: "date_paid",

  startPostcode: "start_postcode",
  endPostcode: "end_postcode",
  numTrips: "num_trips",
  isReturn: "is_return",
  distanceMiles: "distance_miles",

  unitPrice: "unit_price",
  poNumber: "po_number",

  schedulingType: "scheduling_type",
  startTime: "start_time",
  endTime: "end_time",
  isFullDay: "is_full_day",

  expiryDate: "expiry_date",
  totalAmount: "total_amount",
  syncToCalendar: "sync_to_calendar",
  title: "title",
  description: "description",
  location: "location",
  status: "status",
};

export const generateId = () => crypto.randomUUID();

const inverseMap = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k])
);

// ---- Better Supabase error printing + throwing
const formatPgError = (err: any) => {
  if (!err) return "Unknown error";
  const e = err as PostgrestError & { code?: string; hint?: string; details?: string };
  return [
    e.message ? `message: ${e.message}` : null,
    e.code ? `code: ${e.code}` : null,
    e.details ? `details: ${e.details}` : null,
    e.hint ? `hint: ${e.hint}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
};

const logAndThrow = (context: string, err: any) => {
  // Make sure it never just prints "Object"
  console.error(`[Supabase] ${context} FAILED ->`, {
    message: err?.message,
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    raw: err,
    rawString: (() => {
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    })(),
  });

  throw new Error(`${context} failed: ${formatPgError(err)}`);
};

const toDb = (table: string, obj: any, tenantId: string) => {
  const out: any = {};
  if (table !== "tenants") out.tenant_id = tenantId;

  for (const key in obj) {
    if (key === "__isSeed" || key === "tenant_id" || key === "shifts") continue;
    if (key === "rechargeAmount" || key === "actualCost") continue;

    const val = obj[key];

    // ✅ don’t push undefined (prevents accidental overwrites / noisy upserts)
    if (val === undefined) continue;

    const dbKey = FIELD_MAP[key] || key;
    out[dbKey] = val;
  }

  if (obj.id && !out.id) out.id = obj.id;
  return out;
};

const fromDb = (obj: any) => {
  if (!obj) return null;
  const out: any = {};
  for (const key in obj) {
    const jsKey = (inverseMap as any)[key] || key;
    out[jsKey] = obj[key];
  }

  // ✅ Ensure UI-facing key exists even if inverseMap chose a different alias
  if (out.sortCodeOrIBAN == null && obj.sort_code_iban != null) {
    out.sortCodeOrIBAN = obj.sort_code_iban;
  }

  return out;
};

const getLocalData = () => {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!data)
    return {
      tenants: [],
      clients: [],
      jobs: [],
      job_items: [],
      invoices: [],
      mileage: [],
      job_shifts: [],
      quotes: [],
    };
  try {
    return JSON.parse(data);
  } catch {
    return {
      tenants: [],
      clients: [],
      jobs: [],
      job_items: [],
      invoices: [],
      mileage: [],
      job_shifts: [],
      quotes: [],
    };
  }
};

const saveLocalData = (data: any) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {}
};

const getDeletedIds = (): Set<string> => {
  const stored = localStorage.getItem(DELETED_ITEMS_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
};

const markAsDeleted = (id: string) => {
  const ids = getDeletedIds();
  ids.add(id);
  localStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(Array.from(ids)));
};

const removeFromDeletions = (id: string) => {
  const ids = getDeletedIds();
  if (ids.delete(id)) {
    localStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(Array.from(ids)));
  }
};

// ✅ helpers for cached tenant id
const getCachedTenantId = (): string | null => {
  try {
    const v = (localStorage.getItem(TENANT_CACHE_KEY) || "").trim();
    return v || null;
  } catch {
    return null;
  }
};

const setCachedTenantId = (email: string) => {
  try {
    if (email) localStorage.setItem(TENANT_CACHE_KEY, email);
  } catch {}
};

const clearCachedTenantId = () => {
  try {
    localStorage.removeItem(TENANT_CACHE_KEY);
  } catch {}
};

export const getSupabase = (): SupabaseClient => supabase;

export const DB = {
  isCloudConfigured: () =>
    !!import.meta.env.VITE_SUPABASE_URL &&
    !!import.meta.env.VITE_SUPABASE_ANON_KEY,

  // Navigation.tsx expects this to exist
  testConnection: async (): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!DB.isCloudConfigured())
        return { success: false, message: "Not configured" };

      const { data } = await getSupabase().auth.getSession();
      const email = data?.session?.user?.email;
      if (!email) return { success: false, message: "No session" };

      const { error } = await getSupabase()
        .from("tenants")
        .select("email")
        .eq("email", email)
        .limit(1);

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e?.message || "Unknown error" };
    }
  },

  // stable tenant id retrieval (session -> cache -> null)
  getTenantId: async (): Promise<string | null> => {
    try {
      const client = getSupabase();

      // 1) Prefer live session
      const { data, error } = await client.auth.getSession();
      if (!error) {
        const email = data?.session?.user?.email || null;
        if (email) {
          setCachedTenantId(email);
          return email;
        }
      }

      // 2) Fallback to cache (prevents “blink” loops)
      const cached = getCachedTenantId();
      if (cached) return cached;

      return null;
    } catch {
      // 3) Cache fallback even if getSession throws
      const cached = getCachedTenantId();
      return cached || null;
    }
  },

  // caches email when session exists
  initializeSession: async () => {
    try {
      const client = getSupabase();
      const { data } = await client.auth.getSession();
      const email = data?.session?.user?.email || null;
      if (email) setCachedTenantId(email);
    } catch {}
  },

  async call(
    table: string,
    method: "select" | "upsert" | "delete",
    payload?: any,
    filter?: any
  ): Promise<any> {
    const localData = getLocalData();
    let localList = (localData as any)[table] || [];

    const effectiveId = await DB.getTenantId(); // email when signed in
    const tenantId = effectiveId || LOCAL_USER_EMAIL;
    const deletedIds = getDeletedIds();

    // Helper: apply same filter logic to LOCAL list (so merges don't leak)
    const applyLocalFilter = (list: any[]) => {
      let base = (list || []).filter((i: any) => {
        if (table === "tenants") return i.email === tenantId;
        return i.tenant_id === tenantId;
      });

      if (filter) {
        Object.entries(filter).forEach(([k, v]) => {
          const mapped = FIELD_MAP[k] || k;
          base = base.filter((i: any) => i[k] === v || i[mapped] === v);
        });
      }

      const pk = table === "tenants" ? "email" : "id";
      return base.filter((item: any) => !deletedIds.has(item[pk]));
    };

    // ----- LOCAL FIRST (offline support)
    if (method === "upsert" && payload) {
      const raw = Array.isArray(payload) ? payload : [payload];
      raw.forEach((p) => {
        const item =
          table === "tenants" ? { ...p } : { ...p, tenant_id: tenantId };

        const pk = table === "tenants" ? "email" : "id";
        const idx = localList.findIndex((i: any) => i[pk] === item[pk]);
        if (idx >= 0) localList[idx] = { ...localList[idx], ...item };
        else localList.push(item);
        if (item[pk]) removeFromDeletions(item[pk]);
      });

      (localData as any)[table] = localList;
      saveLocalData(localData);
    }

    if (method === "delete") {
      const pk = table === "tenants" ? "email" : "id";
      if (filter?.id) markAsDeleted(filter.id);

      (localData as any)[table] = localList.filter((item: any) => {
        if (filter?.id) return item[pk] !== filter.id;
        if (filter?.jobId)
          return (
            item["jobId"] !== filter.jobId && item["job_id"] !== filter.jobId
          );
        return true;
      });

      saveLocalData(localData);
    }

    // ----- CLOUD (only if signed in)
    if (DB.isCloudConfigured() && effectiveId) {
      const client = getSupabase();
      const query = client.from(table);

      if (method === "upsert" && payload) {
        const raw = Array.isArray(payload) ? payload : [payload];
        const mapped = raw.map((p) => toDb(table, p, effectiveId));

        // 🧠 upsert needs a unique key; select forces detailed response
        const conflictKey = table === "tenants" ? "email" : "id";

        const { data, error } = await query
          .upsert(mapped, { onConflict: conflictKey })
          .select("*");

        if (error) logAndThrow(`upsert:${table}`, error);

        // return mapped objects back if useful
        return (data || []).map(fromDb);
      }

      if (method === "delete") {
        const pk = table === "tenants" ? "email" : "id";

        if (filter?.id) {
          const q = table === "tenants"
            ? query.delete().eq(pk, filter.id)
            : query.delete().eq(pk, filter.id).eq("tenant_id", effectiveId);

          const { error } = await q;
          if (error) logAndThrow(`delete:${table}`, error);
        } else if (filter?.jobId) {
          const { error } = await query
            .delete()
            .eq("job_id", filter.jobId)
            .eq("tenant_id", effectiveId);

          if (error) logAndThrow(`delete:${table}`, error);
        }

        return true;
      }

      if (method === "select") {
        try {
          let q: any;
          if (table === "tenants") q = query.select("*").eq("email", effectiveId);
          else q = query.select("*").eq("tenant_id", effectiveId);

          if (filter) {
            Object.entries(filter).forEach(([k, v]) => {
              q = q.eq(FIELD_MAP[k] || k, v);
            });
          }

          const { data, error } = await q;

          if (error) {
            // Don’t throw on select; fall back to local cache for offline friendliness
            console.warn(`[Supabase] select:${table} failed -> ${formatPgError(error)}`);
          } else if (data !== null) {
            const remoteData = data.map(fromDb);

            const localFiltered = applyLocalFilter(localList);

            const merged = [...remoteData];
            const pk = table === "tenants" ? "email" : "id";

            localFiltered.forEach((localItem: any) => {
              if (
                !merged.find((r: any) => r[pk] === localItem[pk]) &&
                !deletedIds.has(localItem[pk])
              ) {
                merged.push(localItem);
              }
            });

            return merged.filter((item: any) => !deletedIds.has(item[pk]));
          }
        } catch (e) {
          console.error(`Select failed (${table}):`, e);
        }
      }
    }

    // ----- LOCAL SELECT FALLBACK
    if (method === "select") {
      return applyLocalFilter(localList);
    }

    return payload || [];
  },

  // loop-fix user loader
  getCurrentUser: async (): Promise<Tenant | null> => {
    const email = await DB.getTenantId();
    if (!email) return null;

    try {
      const { data, error } = await getSupabase()
        .from("tenants")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (!error && data) {
        return fromDb(data) as Tenant;
      }

      if (error) {
        console.warn("[DB.getCurrentUser] tenants read failed:", formatPgError(error));
      }
    } catch (e) {
      console.warn("[DB.getCurrentUser] tenants read threw:", e);
    }

    const fallback: Tenant = {
      email,
      name: email.split("@")[0],
      businessName: "My Freelance Business",
      businessAddress: "",
      country: "United Kingdom",
      currency: "GBP",
      taxName: "VAT",
      taxRate: 20,
      isVatRegistered: false,
      fiscalYearStartDay: 6,
      fiscalYearStartMonth: 4,
      invoicePrefix: "INV-",
      invoiceNextNumber: 1,
      invoiceNumberingType: "INCREMENTAL",
      plan: UserPlan.TRIAL,
      trialStartDate: new Date().toISOString(),
      paymentStatus: "TRIALING",
    } as any;

    try {
      await DB.updateTenant(fallback);
    } catch (e) {
      console.warn("[DB.getCurrentUser] updateTenant failed (RLS?):", e);
    }

    return fallback;
  },

  // Tenants
  updateTenant: async (t: Tenant) => DB.call("tenants", "upsert", t),

  // Clients
  getClients: async () => DB.call("clients", "select").then((res) => res || []),
  saveClient: async (c: Client) => DB.call("clients", "upsert", c),
  deleteClient: async (id: string) => DB.call("clients", "delete", null, { id }),

  // Jobs + shifts
  getJobs: async () => {
    const jobs = await DB.call("jobs", "select");
    const shifts = await DB.call("job_shifts", "select");
    return (jobs || []).map((j: Job) => ({
      ...j,
      shifts: (shifts || []).filter((s: JobShift) => s.jobId === j.id),
    }));
  },

  saveJob: async (j: Job) => {
    // Make sure we always have a tenant id in cloud mode
    const tenantId = (await DB.getTenantId()) || LOCAL_USER_EMAIL;

    // Save shifts first (keeps your current behaviour)
    await DB.saveShifts(j.id, (j as any).shifts || []);

    // Force tenant_id into job object for local + cloud consistency
    const prepared: Job = { ...j, tenant_id: (j as any).tenant_id || tenantId } as any;

    // IMPORTANT: if supabase upsert fails, DB.call will now THROW.
    return DB.call("jobs", "upsert", prepared);
  },

  deleteJob: async (id: string) => {
    await DB.call("jobs", "delete", null, { id });
    await DB.call("job_shifts", "delete", null, { jobId: id });
    await DB.call("job_items", "delete", null, { jobId: id });
    await DB.call("invoices", "delete", null, { jobId: id });
  },

  getShifts: async (jobId: string) =>
    DB.call("job_shifts", "select", null, { jobId }).then((r) => r || []),

  saveShifts: async (jobId: string, shifts: JobShift[]) => {
    await DB.call("job_shifts", "delete", null, { jobId });
    if (shifts && shifts.length > 0) {
      const tenantId = (await DB.getTenantId()) || LOCAL_USER_EMAIL;
      const prepared = shifts.map((s) => ({ ...s, jobId, tenant_id: tenantId }));
      await DB.call("job_shifts", "upsert", prepared);
    }
  },

  // Job items
  getJobItems: async (jobId: string) =>
    DB.call("job_items", "select", null, { jobId }).then((r) => r || []),

  saveJobItems: async (jobId: string, items: JobItem[]) => {
    await DB.call("job_items", "delete", null, { jobId });
    await DB.call("job_items", "upsert", items);
  },

  deleteJobItem: async (id: string) =>
    DB.call("job_items", "delete", null, { id }),

  // Quotes
  getQuotes: async () => DB.call("quotes", "select").then((r) => r || []),
  saveQuote: async (q: Quote) => DB.call("quotes", "upsert", q),
  deleteQuote: async (id: string) => DB.call("quotes", "delete", null, { id }),

  // Invoices
  getInvoices: async () => DB.call("invoices", "select").then((r) => r || []),
  saveInvoice: async (i: Invoice) => DB.call("invoices", "upsert", i),
  deleteInvoice: async (id: string) => DB.call("invoices", "delete", null, { id }),

  // Mileage
  getMileage: async () => DB.call("mileage", "select").then((r) => r || []),
  saveMileage: async (m: MileageRecord) => DB.call("mileage", "upsert", m),
  deleteMileage: async (id: string) => DB.call("mileage", "delete", null, { id }),

  signOut: async () => {
    try {
      await getSupabase().auth.signOut();
    } catch {}
    clearCachedTenantId();
  },
};