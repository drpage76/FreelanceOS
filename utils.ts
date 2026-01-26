
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
  parse
} from 'date-fns';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
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

/**
 * Generates invoice ID in YYMMXX format
 * YY: Year (e.g. 25)
 * MM: Month (e.g. 01)
 * XX: Sequence (e.g. 01, 02...)
 */
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

export const isOverdue = (dueDate: string, paidDate?: string): boolean => {
  if (paidDate) return false;
  return isAfter(new Date(), parseISO(dueDate));
};

// Calendar Utilities
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
