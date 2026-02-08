
import { 
  format, 
  parseISO, 
  addDays, 
  isAfter, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isWithinInterval,
  differenceInDays,
  isValid
} from 'date-fns';
import { Tenant, UserPlan, Job } from './types';

export const formatCurrency = (amount: number, userSettings?: Tenant | null): string => {
  const currency = userSettings?.currency || 'GBP';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  try {
    return format(parseISO(dateStr), 'dd MMM yy');
  } catch (e) {
    return dateStr;
  }
};

export const checkSubscriptionStatus = (user: Tenant | null) => {
  if (!user) return { isTrialExpired: false, daysLeft: 0, plan: UserPlan.TRIAL };
  if (user.plan === UserPlan.ACTIVE) return { isTrialExpired: false, daysLeft: 0, plan: UserPlan.ACTIVE };

  let startDate = new Date();
  if (user.trialStartDate) {
    const parsed = parseISO(user.trialStartDate);
    if (isValid(parsed)) startDate = parsed;
  }

  const expiryDate = addDays(startDate, 30);
  const diff = differenceInDays(expiryDate, new Date());
  const daysLeft = isNaN(diff) ? 0 : Math.max(0, diff);
  
  return {
    isTrialExpired: daysLeft <= 0,
    daysLeft,
    expiryDate,
    plan: user.plan
  };
};

/**
 * Sequential Job ID Generation
 * Format: YYMMXX (e.g. 260201, 260202)
 * Calculates next number based on existing jobs for that specific month.
 */
export const generateSequentialJobId = (startDate: string, existingJobs: Job[]): string => {
  const date = parseISO(startDate);
  const prefix = format(date, 'yyMM'); // e.g. "2602"
  
  // Filter jobs that belong to this month/year prefix
  const monthlyJobs = existingJobs.filter(j => j.id.startsWith(prefix));
  
  // Extract sequence numbers and find the max
  const sequences = monthlyJobs.map(j => {
    const seqPart = j.id.slice(4);
    return parseInt(seqPart) || 0;
  });
  
  const nextSeq = sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
  return `${prefix}${nextSeq.toString().padStart(2, '0')}`;
};

// Legacy support for other files
export const generateJobId = (startDate: string): string => {
  const date = parseISO(startDate);
  const yy = format(date, 'yy');
  const mm = format(date, 'MM');
  const entropy = Math.floor(1000 + Math.random() * 8999); 
  return `${yy}${mm}${entropy}`;
};

export const generateInvoiceId = (userSettings: Tenant | null): string => {
  if (!userSettings) return `INV-${Date.now()}`;
  
  if (userSettings.invoiceNumberingType === 'DATE_BASED') {
    const now = new Date();
    const yy = format(now, 'yy');
    const mm = format(now, 'MM');
    const seq = (userSettings.invoiceNextNumber || 1).toString().padStart(2, '0');
    return `${yy}${mm}${seq}`;
  } else {
    const prefix = userSettings.invoicePrefix || 'INV-';
    const num = (userSettings.invoiceNextNumber || 1).toString().padStart(4, '0');
    return `${prefix}${num}`;
  }
};

export const calculateDueDate = (startDate: string, terms: number): string => {
  const date = parseISO(startDate);
  return format(addDays(date, terms), 'yyyy-MM-dd');
};

export const calculateRevenueStats = (jobs: any[], userSettings: Tenant | null, goal: number = 50000) => {
  const now = new Date();
  const startDay = userSettings?.fiscalYearStartDay ?? 5;
  const startMonth = (userSettings?.fiscalYearStartMonth ?? 4) - 1; 
  
  let fiscalYearStart = new Date(now.getFullYear(), startMonth, startDay);
  if (now < fiscalYearStart) {
    fiscalYearStart = new Date(now.getFullYear() - 1, startMonth, startDay);
  }
  
  const diff = differenceInDays(now, fiscalYearStart);
  const daysElapsed = Math.max(1, isNaN(diff) ? 1 : diff);
  
  const ytdRevenue = (jobs || [])
    .filter(j => j.status !== 'Cancelled' && parseISO(j.startDate) >= fiscalYearStart && parseISO(j.startDate) <= now)
    .reduce((sum, j) => sum + (j.totalRecharge || 0), 0);

  const dailyRunRate = ytdRevenue / daysElapsed;
  const projectedAnnual = dailyRunRate * 365;
  const percentOfGoal = Math.min(100, (ytdRevenue / goal) * 100);

  return {
    ytdRevenue,
    projectedAnnual,
    percentOfGoal,
    dailyRunRate
  };
};

export const getCalendarDays = (date: Date) => {
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
};

export const isEventInDay = (eventStart: string, eventEnd: string, day: Date) => {
  const start = parseISO(eventStart);
  const end = parseISO(eventEnd);
  if (!isValid(start) || !isValid(end)) return false;
  return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
};
