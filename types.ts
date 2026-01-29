
export enum JobStatus {
  POTENTIAL = 'Potential',
  PENCILLED = 'Pencilled',
  CONFIRMED = 'Confirmed',
  AWAITING_PAYMENT = 'Awaiting Payment',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled'
}

export enum InvoiceStatus {
  DRAFT = 'Draft',
  SENT = 'Sent',
  PAID = 'Paid',
  OVERDUE = 'Overdue'
}

export enum QuoteStatus {
  DRAFT = 'Draft',
  SENT = 'Sent',
  ACCEPTED = 'Accepted',
  DECLINED = 'Declined',
  EXPIRED = 'Expired'
}

export enum UserPlan {
  TRIAL = '3-Month Trial',
  ACTIVE = 'Standard Subscription'
}

export enum SchedulingType {
  CONTINUOUS = 'Continuous',
  SHIFT_BASED = 'Shift-based'
}

export type InvoiceNumberingType = 'INCREMENTAL' | 'DATE_BASED';

export interface Client {
  id: string;
  name: string;
  address: string;
  email: string;
  phone?: string;
  paymentTermsDays: number;
  tenant_id: string;
}

export interface JobItem {
  id: string;
  jobId: string;
  description: string;
  qty: number;
  unitPrice: number;
  rechargeAmount: number;
  actualCost: number;
}

export interface JobShift {
  id: string;
  jobId: string;
  title: string; 
  startDate: string;
  endDate: string;
  startTime: string; 
  endTime: string;   
  isFullDay: boolean;
  tenant_id: string;
}

export interface Job {
  id: string;
  clientId: string;
  startDate: string;
  endDate: string;
  description: string;
  location: string;
  status: JobStatus;
  totalRecharge: number;
  totalCost: number;
  tenant_id: string;
  poNumber?: string;
  schedulingType: SchedulingType;
  shifts?: JobShift[];
}

export interface Quote {
  id: string;
  clientId: string;
  date: string;
  expiryDate: string;
  description: string;
  status: QuoteStatus;
  totalAmount: number;
  tenant_id: string;
  items?: JobItem[];
}

export interface ExternalEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  source: 'google' | 'other';
  color?: string;
}

export interface Invoice {
  id: string;
  jobId: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  tenant_id: string;
  datePaid?: string;
}

export interface MileageRecord {
  id: string;
  date: string;
  startPostcode: string;
  endPostcode: string;
  numTrips: number;
  isReturn: boolean;
  distanceMiles: number;
  jobId?: string;
  clientId?: string;
  description: string;
  tenant_id: string;
}

export interface Tenant {
  email: string;
  name: string;
  businessName: string;
  businessAddress: string;
  companyRegNumber?: string;
  
  // Banking
  accountName?: string;
  accountNumber?: string;
  sortCodeOrIBAN?: string;
  bankDetails?: string; 
  
  // Localization
  currency: string; 
  taxName: string; 
  taxRate: number; 
  isVatRegistered: boolean;
  vatNumber?: string;
  
  // Fiscal Year
  fiscalYearStartDay: number; 
  fiscalYearStartMonth: number; 

  // Invoicing
  invoicePrefix: string; 
  invoiceNextNumber: number; 
  invoiceNumberingType: InvoiceNumberingType;

  logoUrl?: string;
  plan: UserPlan;
  trialStartDate?: string;
  stripeCustomerId?: string;
}

export interface AppState {
  user: Tenant | null;
  clients: Client[];
  jobs: Job[];
  quotes: Quote[];
  externalEvents: ExternalEvent[];
  jobItems: JobItem[];
  invoices: Invoice[];
  mileage: MileageRecord[];
}
