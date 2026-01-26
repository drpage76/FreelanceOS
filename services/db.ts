
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client, Job, JobItem, Invoice, Tenant, UserPlan, MileageRecord, JobShift, SchedulingType, Quote } from '../types';

const SUPABASE_URL = 'https://hucvermrtjxsjcsjirwj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y3Zlcm1ydGp4c2pjc2ppcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDQ1NDAsImV4cCI6MjA4MzgyMDU0MH0.hpdDWrdQubhBW2ga3Vho8J_fOtVw7Xr6GZexF8ksSmA';
const CLOUD_CONFIG_KEY = 'freelance_os_cloud_config';
const LOCAL_STORAGE_KEY = 'freelance_os_local_data_v2'; 
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
  paymentTermsDays: 'payment_terms_days',
  businessName: 'business_name',
  businessAddress: 'business_address',
  bankDetails: 'bank_details',
  logoUrl: 'logo_url',
  stripeCustomerId: 'stripe_customer_id',
  isVatRegistered: 'is_vat_registered',
  vatNumber: 'vat_number',
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
  totalAmount: 'total_amount'
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
  if (newObj.qty !== undefined && newObj.unitPrice !== undefined) {
    newObj.rechargeAmount = (parseFloat(newObj.qty) || 0) * (parseFloat(newObj.unitPrice) || 0);
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

  testConnection: async (): Promise<{ success: boolean; counts?: { clients: number; jobs: number } }> => {
    try {
      const client = getSupabase();
      if (!client) return { success: false };
      const { count: c } = await client.from('clients').select('*', { count: 'exact', head: true });
      const { count: j } = await client.from('jobs').select('*', { count: 'exact', head: true });
      return { success: true, counts: { clients: c || 0, jobs: j || 0 } };
    } catch { return { success: false }; }
  },

  initializeSession: async () => { await DB.getTenantId(); },

  async call(table: string, method: 'select' | 'upsert' | 'delete', payload?: any, filter?: any): Promise<any> {
    const localData = getLocalData();
    const localList = (localData as any)[table] || [];
    const effectiveId = await DB.getTenantId();
    const tenantId = effectiveId || LOCAL_USER_EMAIL;

    if (method === 'upsert' && payload) {
      const raw = Array.isArray(payload) ? payload : [payload];
      raw.forEach(p => {
        const item = toDb(table, p, tenantId);
        const pk = table === 'tenants' ? 'email' : 'id';
        const idx = localList.findIndex((i: any) => i[pk] === item[pk]);
        if (idx >= 0) localList[idx] = item;
        else localList.push(item);
      });
      (localData as any)[table] = localList;
      saveLocalData(localData);
    }

    if (method === 'delete') {
      const pk = table === 'tenants' ? 'email' : 'id';
      if (filter?.id) {
        (localData as any)[table] = localList.filter((i: any) => i[pk] !== filter.id);
      } else if (filter?.jobId) {
        (localData as any)[table] = localList.filter((i: any) => i.job_id !== filter.jobId);
      }
      saveLocalData(localData);
    }

    if (DB.isCloudConfigured() && effectiveId) {
      const client = getSupabase();
      if (client) {
        try {
          const query = client.from(table);
          if (method === 'upsert' && payload) {
            const raw = Array.isArray(payload) ? payload : [payload];
            const mapped = raw.map(p => toDb(table, p, effectiveId));
            await query.upsert(mapped);
          }
          if (method === 'delete') {
            if (filter?.id) await query.delete().eq(table === 'tenants' ? 'email' : 'id', filter.id);
            else if (filter?.jobId) await query.delete().eq('job_id', filter.jobId);
          }
          if (method === 'select') {
            let q = query.select('*').eq(table === 'tenants' ? 'email' : 'tenant_id', effectiveId);
            if (filter) Object.entries(filter).forEach(([k, v]) => q = q.eq(FIELD_MAP[k] || k, v));
            const { data, error } = await q;
            if (!error && data && data.length > 0) return data.map(fromDb);
          }
        } catch (cloudErr) {
          console.warn(`Cloud failure in ${table}.${method}:`, cloudErr);
        }
      }
    }

    if (method === 'select') {
      let base = localList.filter((i: any) => i.tenant_id === tenantId || i.email === tenantId);
      if (filter) {
        Object.entries(filter).forEach(([k, v]) => {
          const dbKey = FIELD_MAP[k] || k;
          base = base.filter((i: any) => i[dbKey] === v);
        });
      }
      return base.map(fromDb);
    }
    return payload;
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
    
    const n: Tenant = { email, name: 'User', businessName: 'Freelance OS', businessAddress: '', bankDetails: '', plan: UserPlan.FREE };
    await DB.updateTenant(n);
    return n;
  },

  updateTenant: async (t: Tenant) => DB.call('tenants', 'upsert', t),
  getClients: async () => DB.call('clients', 'select'),
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
    await DB.call('jobs', 'upsert', j);
    if (j.shifts) await DB.saveShifts(j.id, j.shifts);
  },
  getQuotes: async () => DB.call('quotes', 'select'),
  saveQuote: async (q: Quote) => DB.call('quotes', 'upsert', q),
  deleteQuote: async (id: string) => DB.call('quotes', 'delete', null, { id }),
  getInvoices: async () => DB.call('invoices', 'select'),
  saveInvoice: async (i: Invoice) => DB.call('invoices', 'upsert', i),
  getMileage: async () => DB.call('mileage', 'select'),
  saveMileage: async (m: MileageRecord) => DB.call('mileage', 'upsert', m),
  getJobItems: async (jobId: string) => DB.call('job_items', 'select', null, { jobId }),
  saveJobItems: async (jobId: string, items: JobItem[]) => DB.call('job_items', 'upsert', items),
  getShifts: async (jobId: string) => DB.call('job_shifts', 'select', null, { jobId }),
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
  },
  deleteJobItem: async (id: string) => DB.call('job_items', 'delete', null, { id }),
  deleteInvoice: async (id: string) => DB.call('invoices', 'delete', null, { id }),
  deleteMileage: async (id: string) => DB.call('mileage', 'delete', null, { id }),
  signOut: async () => { await (getSupabase()?.auth as any).signOut(); cachedTenantId = null; supabaseInstance = null; }
};
