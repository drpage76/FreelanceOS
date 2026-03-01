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

// ✅ cache the signed-in email (ONLY safe for offline mode)
const TENANT_CACHE_KEY = "FO_TENANT_ID";

// ✅ cache last good Google provider token (helps when session “blinks”)
const GOOGLE_TOKEN_CACHE_KEY = "FO_GOOGLE_PROVIDER_TOKEN";

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

  // Bank details (tenants table)
  accountName: "account_name",
  accountNumber: "account_number",

  // UI uses sortCodeOrIBAN, DB column is sort_code_iban
  sortCodeOrIBAN: "sort_code_iban",

  // Backwards compat
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

const inverseMap = Object.fromEntries(Object.entries(FIELD_MAP).map(([k, v]) => [v, k]));

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

// ✅ helpers for cached google provider token
const getCachedGoogleToken = (): string | null => {
  try {
    const v = (localStorage.getItem(GOOGLE_TOKEN_CACHE_KEY) || "").trim();
    return v || null;
  } catch {
    return null;
  }
};

const setCachedGoogleToken = (token: string) => {
  try {
    if (token) localStorage.setItem(GOOGLE_TOKEN_CACHE_KEY, token);
  } catch {}
};

const clearCachedGoogleToken = () => {
  try {
    localStorage.removeItem(GOOGLE_TOKEN_CACHE_KEY);
  } catch {}
};

export const getSupabase = (): SupabaseClient => supabase;

export const DB = {
  isCloudConfigured: () =>
    !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY,

  // Navigation.tsx expects this to exist
  testConnection: async (): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!DB.isCloudConfigured()) return { success: false, message: "Not configured" };

      const { data } = await getSupabase().auth.getSession();
      const email = data?.session?.user?.email;
      if (!email) return { success: false, message: "No session" };

      const { error } = await getSupabase().from("tenants").select("email").eq("email", email).limit(1);

      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e?.message || "Unknown error" };
    }
  },

  /**
   * Refresh session best-effort
   */
  refreshAuthSession: async (): Promise<void> => {
    try {
      const client = getSupabase();
      await (client.auth as any).refreshSession?.();
    } catch {}
  },

  /**
   * Google token retrieval (session -> refresh -> cached)
   */
  getGoogleAccessToken: async (): Promise<string | null> => {
    try {
      const client = getSupabase();

      const s1 = await client.auth.getSession();
      const token1 = (s1?.data?.session as any)?.provider_token as string | undefined;
      const email1 = s1?.data?.session?.user?.email || null;

      // ✅ only cache tenant id when an ACTIVE session exists
      if (email1) setCachedTenantId(email1);

      if (token1) {
        setCachedGoogleToken(token1);
        return token1;
      }

      await DB.refreshAuthSession();
      const s2 = await client.auth.getSession();
      const token2 = (s2?.data?.session as any)?.provider_token as string | undefined;
      const email2 = s2?.data?.session?.user?.email || null;

      if (email2) setCachedTenantId(email2);

      if (token2) {
        setCachedGoogleToken(token2);
        return token2;
      }

      // fallback token is OK (doesn't imply signed-in user)
      return getCachedGoogleToken();
    } catch {
      return getCachedGoogleToken();
    }
  },

  clearGoogleTokenCache: () => {
    clearCachedGoogleToken();
  },

  /**
   * ✅ FIXED: tenant id retrieval
   * - If cloud is configured: ONLY return email from a real session
   * - If cloud is NOT configured: allow cached/offline tenant id
   */
  getTenantId: async (): Promise<string | null> => {
    const cloud = DB.isCloudConfigured();

    try {
      const client = getSupabase();
      const { data, error } = await client.auth.getSession();

      // if we have a real session, use it
      if (!error) {
        const email = data?.session?.user?.email || null;
        if (email) {
          setCachedTenantId(email);
          return email;
        }
      }
    } catch {
      // ignore
    }

    // ✅ CRITICAL: do NOT “ghost login” from cache when cloud exists
    if (cloud) return null;

    // offline mode: ok to use cached tenant
    const cached = getCachedTenantId();
    return cached || null;
  },

  /**
   * caches email when session exists
   */
  initializeSession: async () => {
    try {
      const client = getSupabase();
      const { data } = await client.auth.getSession();
      const email = data?.session?.user?.email || null;

      // ✅ only cache if session exists
      if (email) setCachedTenantId(email);

      const token = (data?.session as any)?.provider_token as string | undefined;
      if (token) setCachedGoogleToken(token);
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

    const effectiveId = await DB.getTenantId(); // email when signed in (real session only)
    const tenantId = effectiveId || LOCAL_USER_EMAIL;
    const deletedIds = getDeletedIds();

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
        const item = table === "tenants" ? { ...p } : { ...p, tenant_id: tenantId };

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
        if (filter?.jobId) return item["jobId"] !== filter.jobId && item["job_id"] !== filter.jobId;
        return true;
      });

      saveLocalData(localData);
    }

    // ----- CLOUD (only if signed in AND cloud configured)
    if (DB.isCloudConfigured() && effectiveId) {
      const client = getSupabase();
      const query = client.from(table);

      if (method === "upsert" && payload) {
        const raw = Array.isArray(payload) ? payload : [payload];
        const mapped = raw.map((p) => toDb(table, p, effectiveId));
        const conflictKey = table === "tenants" ? "email" : "id";

        const { data, error } = await query.upsert(mapped, { onConflict: conflictKey }).select("*");
        if (error) logAndThrow(`upsert:${table}`, error);
        return (data || []).map(fromDb);
      }

      if (method === "delete") {
        const pk = table === "tenants" ? "email" : "id";

        if (filter?.id) {
          const q =
            table === "tenants"
              ? query.delete().eq(pk, filter.id)
              : query.delete().eq(pk, filter.id).eq("tenant_id", effectiveId);

          const { error } = await q;
          if (error) logAndThrow(`delete:${table}`, error);
        } else if (filter?.jobId) {
          const { error } = await query.delete().eq("job_id", filter.jobId).eq("tenant_id", effectiveId);
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
            console.warn(`[Supabase] select:${table} failed -> ${formatPgError(error)}`);
          } else if (data !== null) {
            const remoteData = data.map(fromDb);

            const localFiltered = applyLocalFilter(localList);

            const merged = [...remoteData];
            const pk = table === "tenants" ? "email" : "id";

            localFiltered.forEach((localItem: any) => {
              if (!merged.find((r: any) => r[pk] === localItem[pk]) && !deletedIds.has(localItem[pk])) {
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

  /**
   * ✅ FIXED: only return a user if we truly have a session (in cloud mode)
   * Prevents “ghost user” creation which causes redirect loops.
   */
  getCurrentUser: async (): Promise<Tenant | null> => {
    const cloud = DB.isCloudConfigured();
    const email = await DB.getTenantId();

    if (cloud && !email) return null;
    if (!email) return null;

    try {
      const { data, error } = await getSupabase().from("tenants").select("*").eq("email", email).maybeSingle();

      if (!error && data) return fromDb(data) as Tenant;

      if (error) console.warn("[DB.getCurrentUser] tenants read failed:", formatPgError(error));
    } catch (e) {
      console.warn("[DB.getCurrentUser] tenants read threw:", e);
    }

    // If cloud is enabled but tenant row doesn't exist (RLS/missing seed), do NOT create a ghost user.
    if (cloud) return null;

    // Offline fallback
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
      console.warn("[DB.getCurrentUser] updateTenant failed (offline):", e);
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
    const tenantId = (await DB.getTenantId()) || LOCAL_USER_EMAIL;

    await DB.saveShifts(j.id, (j as any).shifts || []);

    const prepared: Job = { ...j, tenant_id: (j as any).tenant_id || tenantId } as any;
    return DB.call("jobs", "upsert", prepared);
  },

  deleteJob: async (id: string) => {
    await DB.call("jobs", "delete", null, { id });
    await DB.call("job_shifts", "delete", null, { jobId: id });
    await DB.call("job_items", "delete", null, { jobId: id });
    await DB.call("invoices", "delete", null, { jobId: id });
  },

  getShifts: async (jobId: string) => DB.call("job_shifts", "select", null, { jobId }).then((r) => r || []),

  saveShifts: async (jobId: string, shifts: JobShift[]) => {
    await DB.call("job_shifts", "delete", null, { jobId });
    if (shifts && shifts.length > 0) {
      const tenantId = (await DB.getTenantId()) || LOCAL_USER_EMAIL;
      const prepared = shifts.map((s) => ({ ...s, jobId, tenant_id: tenantId }));
      await DB.call("job_shifts", "upsert", prepared);
    }
  },

  // Job items
  getJobItems: async (jobId: string) => DB.call("job_items", "select", null, { jobId }).then((r) => r || []),

  saveJobItems: async (jobId: string, items: JobItem[]) => {
    await DB.call("job_items", "delete", null, { jobId });
    await DB.call("job_items", "upsert", items);
  },

  deleteJobItem: async (id: string) => DB.call("job_items", "delete", null, { id }),

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
    clearCachedGoogleToken();
  },
};