
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
  startOfYear,
  differenceInDays
} from 'date-fns';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0
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

export const generateJobId = (startDate: string, sequence: number): string => {
  const date = parseISO(startDate);
  const yy = format(date, 'yy');
  const mm = format(date, 'MM');
  const seq = sequence.toString().padStart(2, '0');
  return `${yy}${mm}${seq}`;
};

export const generateInvoiceId = (sequence: number): string => {
  const now = new Date();
  const yy = format(now, 'yy');
  const mm = format(now, 'MM');
  const seq = (sequence + 1).toString().slice(-2).padStart(2, '0');
  return `${yy}${mm}${seq}`;
};

export const calculateDueDate = (startDate: string, terms: number): string => {
  const date = parseISO(startDate);
  return format(addDays(date, terms), 'yyyy-MM-dd');
};

export const calculateRevenueStats = (jobs: any[], goal: number = 50000) => {
  const now = new Date();
  
  // UK Fiscal Year Logic: Starts April 5th as requested
  let fiscalYearStart = new Date(now.getFullYear(), 3, 5); // Month is 0-indexed, so 3 is April
  if (now < fiscalYearStart) {
    fiscalYearStart = new Date(now.getFullYear() - 1, 3, 5);
  }
  
  const daysElapsed = Math.max(1, differenceInDays(now, fiscalYearStart));
  
  const ytdRevenue = (jobs || [])
    .filter(j => j.status !== 'Cancelled' && parseISO(j.startDate) >= fiscalYearStart && parseISO(j.startDate) <= now)
    .reduce((sum, j) => sum + (j.totalRecharge || 0), 0);

  // Projection based on current daily velocity
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
  return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
};
