
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client, Job, JobItem, Invoice, Tenant, UserPlan, MileageRecord, JobShift, SchedulingType, Quote } from '../types';

const SUPABASE_URL = 'https://hucvermrtjxsjcsjirwj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y3Zlcm1ydGp4c2pjc2ppcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDQ1NDAsImV4cCI6MjA4MzgyMDU0MH0.hpdDWrdQubhBW2ga3Vho8J_fOtVw7Xr6GZexF8ksSmA';
const CLOUD_CONFIG_KEY = 'freelance_os_cloud_config';
const LOCAL_STORAGE_KEY = 'freelance_os_local_data_v4'; // Bumped to v4 to clear any randomized/collided legacy data
const DELETED_ITEMS_KEY = 'freelance_os_deleted_ids';
const LOCAL_USER_EMAIL = 'local@freelanceos.internal';

const getStoredConfig = () => {
  const stored = localStorage.getItem(CLOUD_CONFIG_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.url && parsed?.key) return parsed;
    } catch { localStorage.removeItem(CLOUD_CONFIG_KEY); }
  }
  return null;
};

let supabaseInstance: SupabaseClient | null = null;
let cachedTenantId: string | null = null;

export const getSupabase = () => {
  if (supabaseInstance) return supabaseInstance;
  const config = getStoredConfig();
  const url = config?.url || SUPABASE_URL;
  const key = config?.key || SUPABASE_ANON_KEY;
  if (url && key && url.startsWith('http')) {
    supabaseInstance = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return supabaseInstance;
};

const FIELD_MAP: Record<string, string> = {
  email: 'email',
  name: 'name',
  businessName: 'business_name',
  businessAddress: 'business_address',
  companyRegNumber: 'company_reg_number',
  accountName: 'account_name',
  accountNumber: 'account_number',
  sortCodeOrIBAN: 'sort_code_iban',
  bankDetails: 'bank_details',
  logoUrl: 'logo_url',
  stripeCustomerId: 'stripe_customer_id',
  isVatRegistered: 'is_vat_registered',
  vatNumber: 'vat_number',
  taxName: 'tax_name',
  taxRate: 'tax_rate',
  currency: 'currency',
  fiscalYearStartDay: 'fiscal_year_start_day',
  fiscalYearStartMonth: 'fiscal_year_start_month',
  invoicePrefix: 'invoice_prefix',
  invoiceNextNumber: 'invoice_next_number',
  invoiceNumberingType: 'invoice_numbering_type',
  trialStartDate: 'trial_start_date',
  plan: 'plan',
  paymentTermsDays: 'payment_terms_days',
  clientId: 'client_id',
  startDate: 'start_date',
  endDate: 'end_date',
  totalRecharge: 'total_recharge',
  totalCost: 'total_cost',
  jobId: 'job_id',
  dueDate: 'due_date',
  datePaid: 'date_paid',
  startPostcode: 'start_postcode',
  endPostcode: 'end_postcode',
  numTrips: 'num_trips',
  isReturn: 'is_return',
  distanceMiles: 'distance_miles',
  unitPrice: 'unit_price',
  poNumber: 'po_number',
  schedulingType: 'scheduling_type',
  startTime: 'start_time',
  endTime: 'end_time',
  isFullDay: 'is_full_day',
  expiryDate: 'expiry_date',
  totalAmount: 'total_amount',
  syncToCalendar: 'sync_to_calendar',
  title: 'title',
  description: 'description',
  location: 'location',
  status: 'status'
};

const toDb = (table: string, obj: any, tenantId: string) => {
  const newObj: any = {};
  if (table !== 'tenants') newObj['tenant_id'] = tenantId;
  
  for (const key in obj) {
    if (key === '__isSeed' || key === 'tenant_id' || key === 'shifts') continue;
    if (key === 'rechargeAmount' || key === 'actualCost') continue;

    const dbKey = FIELD_MAP[key] || key;
    newObj[dbKey] = obj[key];
  }
  if (obj.id && !newObj.id) {
    newObj.id = obj.id;
  }
  return newObj;
};

const fromDb = (obj: any) => {
  if (!obj) return null;
  const newObj: any = {};
  const inverseMap = Object.fromEntries(Object.entries(FIELD_MAP).map(([k, v]) => [v, k]));
  for (const key in obj) {
    const jsKey = inverseMap[key] || key;
    newObj[jsKey] = obj[key];
  }
  return newObj;
};

const getLocalData = () => {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!data) return { tenants: [], clients: [], jobs: [], job_items: [], invoices: [], mileage: [], job_shifts: [], quotes: [] };
  try {
    return JSON.parse(data);
  } catch { return { tenants: [], clients: [], jobs: [], job_items: [], invoices: [], mileage: [], job_shifts: [], quotes: [] }; }
};

const saveLocalData = (data: any) => {
  try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data)); } catch (e) { }
};

const getDeletedIds = (): Set<string> => {
  const stored = localStorage.getItem(DELETED_ITEMS_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch { return new Set(); }
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

export const generateId = () => crypto.randomUUID();

export const DB = {
  isCloudConfigured: () => !!(getStoredConfig()?.url || SUPABASE_URL),

  getTenantId: async (): Promise<string | null> => {
    const client = getSupabase();
    if (!client) return null;
    try {
      const { data: { session } } = await (client.auth as any).getSession();
      if (session?.user?.email) {
        cachedTenantId = session.user.email;
        return cachedTenantId;
      }
    } catch (e) { }
    return null;
  },

  testConnection: async (): Promise<{ success: boolean }> => {
    try {
      const client = getSupabase();
      if (!client) return { success: false };
      const { error } = await client.from('clients').select('id').limit(1);
      if (error) return { success: false };
      return { success: true };
    } catch { return { success: false }; }
  },

  initializeSession: async () => { await DB.getTenantId(); },

  async call(table: string, method: 'select' | 'upsert' | 'delete', payload?: any, filter?: any): Promise<any> {
    const localData = getLocalData();
    let localList = (localData as any)[table] || [];
    const effectiveId = await DB.getTenantId();
    const tenantId = effectiveId || LOCAL_USER_EMAIL;
    const deletedIds = getDeletedIds();

    if (method === 'upsert' && payload) {
      const raw = Array.isArray(payload) ? payload : [payload];
      raw.forEach(p => {
        const item = { ...p, tenant_id: tenantId };
        const pk = table === 'tenants' ? 'email' : 'id';
        const idx = localList.findIndex((i: any) => i[pk] === item[pk]);
        if (idx >= 0) localList[idx] = { ...localList[idx], ...item };
        else localList.push(item);
        if (item[pk]) removeFromDeletions(item[pk]);
      });
      (localData as any)[table] = localList;
      saveLocalData(localData);
    }

    if (method === 'delete') {
      const pk = table === 'tenants' ? 'email' : 'id';
      if (filter?.id) markAsDeleted(filter.id);
      (localData as any)[table] = localList.filter((item: any) => {
        if (filter?.id) return item[pk] !== filter.id;
        if (filter?.jobId) return item['jobId'] !== filter.jobId && item['job_id'] !== filter.jobId;
        return true;
      });
      saveLocalData(localData);
    }

    if (DB.isCloudConfigured() && effectiveId) {
      const client = getSupabase();
      if (client) {
        const query = client.from(table);
        if (method === 'upsert' && payload) {
          const raw = Array.isArray(payload) ? payload : [payload];
          const mapped = raw.map(p => toDb(table, p, effectiveId));
          const { error } = await query.upsert(mapped);
          if (error) console.error(`Supabase Upsert Error (${table}):`, error);
        }
        if (method === 'delete') {
          const pk = table === 'tenants' ? 'email' : 'id';
          if (filter?.id) await query.delete().eq(pk, filter.id);
          else if (filter?.jobId) await query.delete().eq('job_id', filter.jobId);
        }
        if (method === 'select') {
          try {
            let q = query.select('*').eq(table === 'tenants' ? 'email' : 'tenant_id', effectiveId);
            if (filter) Object.entries(filter).forEach(([k, v]) => q = q.eq(FIELD_MAP[k] || k, v));
            const { data, error } = await q;
            
            if (!error && data !== null) {
              const remoteData = data.map(fromDb);
              const merged = [...remoteData];
              localList.forEach((localItem: any) => {
                const pk = table === 'tenants' ? 'email' : 'id';
                if (!merged.find(remoteItem => remoteItem[pk] === localItem[pk]) && !deletedIds.has(localItem[pk])) {
                  merged.push(localItem);
                }
              });

              return merged.filter(item => {
                const pk = table === 'tenants' ? 'email' : 'id';
                return !deletedIds.has(item[pk]);
              });
            }
          } catch (e) {
            console.error(`Protocol Error in Select (${table}):`, e);
          }
        }
      }
    }

    if (method === 'select') {
      let base = (localList || []).filter((i: any) => i.tenant_id === tenantId || i.email === tenantId);
      if (filter) {
        Object.entries(filter).forEach(([k, v]) => {
          base = base.filter((i: any) => i[k] === v || i[FIELD_MAP[k] || k] === v);
        });
      }
      return base.filter(item => {
        const pk = table === 'tenants' ? 'email' : 'id';
        return !deletedIds.has(item[pk]);
      });
    }
    return payload || [];
  },

  getCurrentUser: async (): Promise<Tenant | null> => {
    const email = await DB.getTenantId();
    if (!email) return null;
    const client = getSupabase();
    if (!client) return null;
    try {
      const { data } = await client.from('tenants').select('*').eq('email', email).maybeSingle();
      if (data) return fromDb(data) as Tenant;
    } catch (e) {}
    
    const n: Tenant = { 
      email, name: email.split('@')[0], businessName: 'My Freelance Business', businessAddress: '', 
      currency: 'GBP', taxName: 'VAT', taxRate: 20, isVatRegistered: false, fiscalYearStartDay: 6,
      fiscalYearStartMonth: 4, invoicePrefix: 'INV-', invoiceNextNumber: 1, invoiceNumberingType: 'INCREMENTAL',
      plan: UserPlan.TRIAL, trialStartDate: new Date().toISOString(), paymentStatus: 'TRIALING'
    };
    await DB.updateTenant(n);
    return n;
  },

  updateTenant: async (t: Tenant) => DB.call('tenants', 'upsert', t),
  getClients: async () => DB.call('clients', 'select').then(res => res || []),
  saveClient: async (c: Client) => DB.call('clients', 'upsert', c),
  getJobs: async () => {
    const jobs = await DB.call('jobs', 'select');
    const allShifts = await DB.call('job_shifts', 'select');
    return (jobs || []).map((j: Job) => ({
      ...j,
      shifts: (allShifts || []).filter((s: JobShift) => s.jobId === j.id)
    }));
  },
  saveJob: async (j: Job) => {
    await DB.saveShifts(j.id, j.shifts || []);
    await DB.call('jobs', 'upsert', j);
  },
  getQuotes: async () => DB.call('quotes', 'select').then(res => res || []),
  saveQuote: async (q: Quote) => DB.call('quotes', 'upsert', q),
  deleteQuote: async (id: string) => DB.call('quotes', 'delete', null, { id }),
  getInvoices: async () => DB.call('invoices', 'select').then(res => res || []),
  saveInvoice: async (i: Invoice) => {
    await DB.call('invoices', 'upsert', i);
    const user = await DB.getCurrentUser();
    if (user && (i.id.startsWith(user.invoicePrefix) || user.invoiceNumberingType === 'DATE_BASED')) {
      await DB.updateTenant({ ...user, invoiceNextNumber: (user.invoiceNextNumber || 0) + 1 });
    }
  },
  getMileage: async () => DB.call('mileage', 'select').then(res => res || []),
  saveMileage: async (m: MileageRecord) => DB.call('mileage', 'upsert', m),
  getJobItems: async (jobId: string) => DB.call('job_items', 'select', null, { jobId }).then(res => res || []),
  saveJobItems: async (jobId: string, items: JobItem[]) => {
    // ATOMIC INTEGRITY PROTOCOL: Delete existing items for this job ID first to prevent ghost leakage
    await DB.call('job_items', 'delete', null, { jobId });
    await DB.call('job_items', 'upsert', items);
  },
  getShifts: async (jobId: string) => DB.call('job_shifts', 'select', null, { jobId }).then(res => res || []),
  saveShifts: async (jobId: string, shifts: JobShift[]) => {
    await DB.call('job_shifts', 'delete', null, { jobId });
    if (shifts && shifts.length > 0) {
      const tenantId = await DB.getTenantId() || LOCAL_USER_EMAIL;
      const preparedShifts = shifts.map(s => ({ ...s, jobId, tenant_id: tenantId }));
      await DB.call('job_shifts', 'upsert', preparedShifts);
    }
  },
  deleteClient: async (id: string) => DB.call('clients', 'delete', null, { id }),
  deleteJob: async (id: string) => {
    await DB.call('jobs', 'delete', null, { id });
    await DB.call('job_shifts', 'delete', null, { jobId: id });
    await DB.call('job_items', 'delete', null, { jobId: id });
    await DB.call('invoices', 'delete', null, { jobId: id }); 
  },
  deleteJobItem: async (id: string) => DB.call('job_items', 'delete', null, { id }),
  deleteInvoice: async (id: string) => DB.call('invoices', 'delete', null, { id }),
  deleteMileage: async (id: string) => DB.call('mileage', 'delete', null, { id }),
  signOut: async () => { 
    const client = getSupabase();
    if (client) await (client.auth as any).signOut(); 
    cachedTenantId = null; 
    supabaseInstance = null; 
  }
};
