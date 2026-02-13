// services/db.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";
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

// Keep your map (trim/extend as needed)
const FIELD_MAP: Record<string, string> = {
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

const toDb = (table: string, obj: any, tenantId: string) => {
  const out: any = {};
  if (table !== "tenants") out.tenant_id = tenantId;

  for (const key in obj) {
    if (key === "__isSeed" || key === "tenant_id" || key === "shifts") continue;
    if (key === "rechargeAmount" || key === "actualCost") continue;

    const dbKey = FIELD_MAP[key] || key;
    out[dbKey] = obj[key];
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

export const getSupabase = (): SupabaseClient => supabase;

export const DB = {
  // IMPORTANT: matches supabaseClient.ts (env OR fallback)
  isCloudConfigured: () => isSupabaseConfigured(),

  getTenantId: async (): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.user?.email || null;
    } catch {
      return null;
    }
  },

  initializeSession: async () => {
    await DB.getTenantId();
  },

  // Navigation.tsx calls this
  testConnection: async (): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!DB.isCloudConfigured()) return { success: false, message: "Not configured" };

      const email = await DB.getTenantId();
      if (!email) return { success: false, message: "No session" };

      // lightweight ping
      const { error } = await supabase
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

    // ----- LOCAL FIRST (so you can work offline)
    if (method === "upsert" && payload) {
      const raw = Array.isArray(payload) ? payload : [payload];
      raw.forEach((p) => {
        const item = { ...p, tenant_id: tenantId };
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
          return item["jobId"] !== filter.jobId && item["job_id"] !== filter.jobId;
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
        const { error } = await query.upsert(mapped);
        if (error) console.error(`Supabase upsert error (${table}):`, error);
      }

      if (method === "delete") {
        const pk = table === "tenants" ? "email" : "id";
        if (filter?.id) await query.delete().eq(pk, filter.id);
        else if (filter?.jobId) await query.delete().eq("job_id", filter.jobId);
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
          if (!error && data !== null) {
            const remoteData = data.map(fromDb);

            // Merge local additions that haven't been deleted
            const merged = [...remoteData];
            localList.forEach((localItem: any) => {
              const pk = table === "tenants" ? "email" : "id";
              if (
                !merged.find((r: any) => r[pk] === localItem[pk]) &&
                !deletedIds.has(localItem[pk])
              ) {
                merged.push(localItem);
              }
            });

            return merged.filter((item: any) => {
              const pk = table === "tenants" ? "email" : "id";
              return !deletedIds.has(item[pk]);
            });
          }
        } catch (e) {
          console.error(`Select failed (${table}):`, e);
        }
      }
    }

    // ----- LOCAL SELECT FALLBACK
    if (method === "select") {
      let base = (localList || []).filter(
        (i: any) => i.tenant_id === tenantId || i.email === tenantId
      );
      if (filter) {
        Object.entries(filter).forEach(([k, v]) => {
          base = base.filter((i: any) => i[k] === v || i[FIELD_MAP[k] || k] === v);
        });
      }
      return base.filter((item: any) => {
        const pk = table === "tenants" ? "email" : "id";
        return !deletedIds.has(item[pk]);
      });
    }

    return payload || [];
  },

  getCurrentUser: async (): Promise<Tenant | null> => {
    const email = await DB.getTenantId();
    if (!email) return null;

    try {
      const { data } = await getSupabase()
        .from("tenants")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (data) return fromDb(data) as Tenant;
    } catch {}

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

    await DB.updateTenant(fallback);
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
    await DB.saveShifts(j.id, (j as any).shifts || []);
    await DB.call("jobs", "upsert", j);
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
  },
};
