
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
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (e) {
    // Fallback if the currency code is invalid or unsupported by the environment
    return `${currency} ${amount.toFixed(2)}`;
  }
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
 * Robust Sequential Job ID Generation
 * Format: YYMMXX (e.g. 260201, 260202)
 * Strictly ignores legacy IDs containing hyphens or randomized strings.
 */
export const generateSequentialJobId = (startDate: string, existingJobs: Job[]): string => {
  const date = parseISO(startDate);
  const prefix = format(date, 'yyMM'); // e.g. "2602"
  
  // Filter jobs for this month AND ensure they are exactly 6 digits (the standard YYMMXX pattern)
  // This ignores legacy IDs like '2602-124157' or randomized entropy.
  const monthlyJobs = existingJobs.filter(j => 
    j.id.startsWith(prefix) && 
    j.id.length === 6 && 
    !j.id.includes('-')
  );
  
  // Extract sequence numbers (the last 2 digits)
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

export const COUNTRIES = [
  { name: 'Afghanistan', code: 'AF', currency: 'AFN' },
  { name: 'Albania', code: 'AL', currency: 'ALL' },
  { name: 'Algeria', code: 'DZ', currency: 'DZD' },
  { name: 'Andorra', code: 'AD', currency: 'EUR' },
  { name: 'Angola', code: 'AO', currency: 'AOA' },
  { name: 'Antigua and Barbuda', code: 'AG', currency: 'XCD' },
  { name: 'Argentina', code: 'AR', currency: 'ARS' },
  { name: 'Armenia', code: 'AM', currency: 'AMD' },
  { name: 'Australia', code: 'AU', currency: 'AUD' },
  { name: 'Austria', code: 'AT', currency: 'EUR' },
  { name: 'Azerbaijan', code: 'AZ', currency: 'AZN' },
  { name: 'Bahamas', code: 'BS', currency: 'BSD' },
  { name: 'Bahrain', code: 'BH', currency: 'BHD' },
  { name: 'Bangladesh', code: 'BD', currency: 'BDT' },
  { name: 'Barbados', code: 'BB', currency: 'BBD' },
  { name: 'Belarus', code: 'BY', currency: 'BYN' },
  { name: 'Belgium', code: 'BE', currency: 'EUR' },
  { name: 'Belize', code: 'BZ', currency: 'BZD' },
  { name: 'Benin', code: 'BJ', currency: 'XOF' },
  { name: 'Bhutan', code: 'BT', currency: 'BTN' },
  { name: 'Bolivia', code: 'BO', currency: 'BOB' },
  { name: 'Bosnia and Herzegovina', code: 'BA', currency: 'BAM' },
  { name: 'Botswana', code: 'BW', currency: 'BWP' },
  { name: 'Brazil', code: 'BR', currency: 'BRL' },
  { name: 'Brunei', code: 'BN', currency: 'BND' },
  { name: 'Bulgaria', code: 'BG', currency: 'BGN' },
  { name: 'Burkina Faso', code: 'BF', currency: 'XOF' },
  { name: 'Burundi', code: 'BI', currency: 'BIF' },
  { name: 'Cambodia', code: 'KH', currency: 'KHR' },
  { name: 'Cameroon', code: 'CM', currency: 'XAF' },
  { name: 'Canada', code: 'CA', currency: 'CAD' },
  { name: 'Cape Verde', code: 'CV', currency: 'CVE' },
  { name: 'Central African Republic', code: 'CF', currency: 'XAF' },
  { name: 'Chad', code: 'TD', currency: 'XAF' },
  { name: 'Chile', code: 'CL', currency: 'CLP' },
  { name: 'China', code: 'CN', currency: 'CNY' },
  { name: 'Colombia', code: 'CO', currency: 'COP' },
  { name: 'Comoros', code: 'KM', currency: 'KMF' },
  { name: 'Congo, Democratic Republic of the', code: 'CD', currency: 'CDF' },
  { name: 'Congo, Republic of the', code: 'CG', currency: 'XAF' },
  { name: 'Costa Rica', code: 'CR', currency: 'CRC' },
  { name: 'Croatia', code: 'HR', currency: 'EUR' },
  { name: 'Cuba', code: 'CU', currency: 'CUP' },
  { name: 'Cyprus', code: 'CY', currency: 'EUR' },
  { name: 'Czech Republic', code: 'CZ', currency: 'CZK' },
  { name: 'Denmark', code: 'DK', currency: 'DKK' },
  { name: 'Djibouti', code: 'DJ', currency: 'DJF' },
  { name: 'Dominica', code: 'DM', currency: 'XCD' },
  { name: 'Dominican Republic', code: 'DO', currency: 'DOP' },
  { name: 'Ecuador', code: 'EC', currency: 'USD' },
  { name: 'Egypt', code: 'EG', currency: 'EGP' },
  { name: 'El Salvador', code: 'SV', currency: 'USD' },
  { name: 'Equatorial Guinea', code: 'GQ', currency: 'XAF' },
  { name: 'Eritrea', code: 'ER', currency: 'ERN' },
  { name: 'Estonia', code: 'EE', currency: 'EUR' },
  { name: 'Eswatini', code: 'SZ', currency: 'SZL' },
  { name: 'Ethiopia', code: 'ET', currency: 'ETB' },
  { name: 'Fiji', code: 'FJ', currency: 'FJD' },
  { name: 'Finland', code: 'FI', currency: 'EUR' },
  { name: 'France', code: 'FR', currency: 'EUR' },
  { name: 'Gabon', code: 'GA', currency: 'XAF' },
  { name: 'Gambia', code: 'GM', currency: 'GMD' },
  { name: 'Georgia', code: 'GE', currency: 'GEL' },
  { name: 'Germany', code: 'DE', currency: 'EUR' },
  { name: 'Ghana', code: 'GH', currency: 'GHS' },
  { name: 'Greece', code: 'GR', currency: 'EUR' },
  { name: 'Grenada', code: 'GD', currency: 'XCD' },
  { name: 'Guatemala', code: 'GT', currency: 'GTQ' },
  { name: 'Guinea', code: 'GN', currency: 'GNF' },
  { name: 'Guinea-Bissau', code: 'GW', currency: 'XOF' },
  { name: 'Guyana', code: 'GY', currency: 'GYD' },
  { name: 'Haiti', code: 'HT', currency: 'HTG' },
  { name: 'Honduras', code: 'HN', currency: 'HNL' },
  { name: 'Hungary', code: 'HU', currency: 'HUF' },
  { name: 'Iceland', code: 'IS', currency: 'ISK' },
  { name: 'India', code: 'IN', currency: 'INR' },
  { name: 'Indonesia', code: 'ID', currency: 'IDR' },
  { name: 'Iran', code: 'IR', currency: 'IRR' },
  { name: 'Iraq', code: 'IQ', currency: 'IQD' },
  { name: 'Ireland', code: 'IE', currency: 'EUR' },
  { name: 'Israel', code: 'IL', currency: 'ILS' },
  { name: 'Italy', code: 'IT', currency: 'EUR' },
  { name: 'Jamaica', code: 'JM', currency: 'JMD' },
  { name: 'Japan', code: 'JP', currency: 'JPY' },
  { name: 'Jordan', code: 'JO', currency: 'JOD' },
  { name: 'Kazakhstan', code: 'KZ', currency: 'KZT' },
  { name: 'Kenya', code: 'KE', currency: 'KES' },
  { name: 'Kiribati', code: 'KI', currency: 'AUD' },
  { name: 'Korea, North', code: 'KP', currency: 'KPW' },
  { name: 'Korea, South', code: 'KR', currency: 'KRW' },
  { name: 'Kuwait', code: 'KW', currency: 'KWD' },
  { name: 'Kyrgyzstan', code: 'KG', currency: 'KGS' },
  { name: 'Laos', code: 'LA', currency: 'LAK' },
  { name: 'Latvia', code: 'LV', currency: 'EUR' },
  { name: 'Lebanon', code: 'LB', currency: 'LBP' },
  { name: 'Lesotho', code: 'LS', currency: 'LSL' },
  { name: 'Liberia', code: 'LR', currency: 'LRD' },
  { name: 'Libya', code: 'LY', currency: 'LYD' },
  { name: 'Liechtenstein', code: 'LI', currency: 'CHF' },
  { name: 'Lithuania', code: 'LT', currency: 'EUR' },
  { name: 'Luxembourg', code: 'LU', currency: 'EUR' },
  { name: 'Madagascar', code: 'MG', currency: 'MGA' },
  { name: 'Malawi', code: 'MW', currency: 'MWK' },
  { name: 'Malaysia', code: 'MY', currency: 'MYR' },
  { name: 'Maldives', code: 'MV', currency: 'MVR' },
  { name: 'Mali', code: 'ML', currency: 'XOF' },
  { name: 'Malta', code: 'MT', currency: 'EUR' },
  { name: 'Marshall Islands', code: 'MH', currency: 'USD' },
  { name: 'Mauritania', code: 'MR', currency: 'MRU' },
  { name: 'Mauritius', code: 'MU', currency: 'MUR' },
  { name: 'Mexico', code: 'MX', currency: 'MXN' },
  { name: 'Micronesia', code: 'FM', currency: 'USD' },
  { name: 'Moldova', code: 'MD', currency: 'MDL' },
  { name: 'Monaco', code: 'MC', currency: 'EUR' },
  { name: 'Mongolia', code: 'MN', currency: 'MNT' },
  { name: 'Montenegro', code: 'ME', currency: 'EUR' },
  { name: 'Morocco', code: 'MA', currency: 'MAD' },
  { name: 'Mozambique', code: 'MZ', currency: 'MZN' },
  { name: 'Myanmar', code: 'MM', currency: 'MMK' },
  { name: 'Namibia', code: 'NA', currency: 'NAD' },
  { name: 'Nauru', code: 'NR', currency: 'AUD' },
  { name: 'Nepal', code: 'NP', currency: 'NPR' },
  { name: 'Netherlands', code: 'NL', currency: 'EUR' },
  { name: 'New Zealand', code: 'NZ', currency: 'NZD' },
  { name: 'Nicaragua', code: 'NI', currency: 'NIO' },
  { name: 'Niger', code: 'NE', currency: 'XOF' },
  { name: 'Nigeria', code: 'NG', currency: 'NGN' },
  { name: 'North Macedonia', code: 'MK', currency: 'MKD' },
  { name: 'Norway', code: 'NO', currency: 'NOK' },
  { name: 'Oman', code: 'OM', currency: 'OMR' },
  { name: 'Pakistan', code: 'PK', currency: 'PKR' },
  { name: 'Palau', code: 'PW', currency: 'USD' },
  { name: 'Panama', code: 'PA', currency: 'PAB' },
  { name: 'Papua New Guinea', code: 'PG', currency: 'PGK' },
  { name: 'Paraguay', code: 'PY', currency: 'PYG' },
  { name: 'Peru', code: 'PE', currency: 'PEN' },
  { name: 'Philippines', code: 'PH', currency: 'PHP' },
  { name: 'Poland', code: 'PL', currency: 'PLN' },
  { name: 'Portugal', code: 'PT', currency: 'EUR' },
  { name: 'Qatar', code: 'QA', currency: 'QAR' },
  { name: 'Romania', code: 'RO', currency: 'RON' },
  { name: 'Russia', code: 'RU', currency: 'RUB' },
  { name: 'Rwanda', code: 'RW', currency: 'RWF' },
  { name: 'Saint Kitts and Nevis', code: 'KN', currency: 'XCD' },
  { name: 'Saint Lucia', code: 'LC', currency: 'XCD' },
  { name: 'Saint Vincent and the Grenadines', code: 'VC', currency: 'XCD' },
  { name: 'Samoa', code: 'WS', currency: 'WST' },
  { name: 'San Marino', code: 'SM', currency: 'EUR' },
  { name: 'Sao Tome and Principe', code: 'ST', currency: 'STN' },
  { name: 'Saudi Arabia', code: 'SA', currency: 'SAR' },
  { name: 'Senegal', code: 'SN', currency: 'XOF' },
  { name: 'Serbia', code: 'RS', currency: 'RSD' },
  { name: 'Seychelles', code: 'SC', currency: 'SCR' },
  { name: 'Sierra Leone', code: 'SL', currency: 'SLE' },
  { name: 'Singapore', code: 'SG', currency: 'SGD' },
  { name: 'Slovakia', code: 'SK', currency: 'EUR' },
  { name: 'Slovenia', code: 'SI', currency: 'EUR' },
  { name: 'Solomon Islands', code: 'SB', currency: 'SBD' },
  { name: 'Somalia', code: 'SO', currency: 'SOS' },
  { name: 'South Africa', code: 'ZA', currency: 'ZAR' },
  { name: 'South Sudan', code: 'SS', currency: 'SSP' },
  { name: 'Spain', code: 'ES', currency: 'EUR' },
  { name: 'Sri Lanka', code: 'LK', currency: 'LKR' },
  { name: 'Sudan', code: 'SD', currency: 'SDG' },
  { name: 'Suriname', code: 'SR', currency: 'SRD' },
  { name: 'Sweden', code: 'SE', currency: 'SEK' },
  { name: 'Switzerland', code: 'CH', currency: 'CHF' },
  { name: 'Syria', code: 'SY', currency: 'SYP' },
  { name: 'Taiwan', code: 'TW', currency: 'TWD' },
  { name: 'Tajikistan', code: 'TJ', currency: 'TJS' },
  { name: 'Tanzania', code: 'TZ', currency: 'TZS' },
  { name: 'Thailand', code: 'TH', currency: 'THB' },
  { name: 'Timor-Leste', code: 'TL', currency: 'USD' },
  { name: 'Togo', code: 'TG', currency: 'XOF' },
  { name: 'Tonga', code: 'TO', currency: 'TOP' },
  { name: 'Trinidad and Tobago', code: 'TT', currency: 'TTD' },
  { name: 'Tunisia', code: 'TN', currency: 'TND' },
  { name: 'Turkey', code: 'TR', currency: 'TRY' },
  { name: 'Turkmenistan', code: 'TM', currency: 'TMT' },
  { name: 'Tuvalu', code: 'TV', currency: 'AUD' },
  { name: 'Uganda', code: 'UG', currency: 'UGX' },
  { name: 'Ukraine', code: 'UA', currency: 'UAH' },
  { name: 'United Arab Emirates', code: 'AE', currency: 'AED' },
  { name: 'United Kingdom', code: 'GB', currency: 'GBP' },
  { name: 'United States', code: 'US', currency: 'USD' },
  { name: 'Uruguay', code: 'UY', currency: 'UYU' },
  { name: 'Uzbekistan', code: 'UZ', currency: 'UZS' },
  { name: 'Vanuatu', code: 'VU', currency: 'VUV' },
  { name: 'Vatican City', code: 'VA', currency: 'EUR' },
  { name: 'Venezuela', code: 'VE', currency: 'VES' },
  { name: 'Vietnam', code: 'VN', currency: 'VND' },
  { name: 'Yemen', code: 'YE', currency: 'YER' },
  { name: 'Zambia', code: 'ZM', currency: 'ZMW' },
  { name: 'Zimbabwe', code: 'ZW', currency: 'ZWG' }
];

export const UNIQUE_CURRENCIES = Array.from(new Set(COUNTRIES.map(c => c.currency))).sort();
