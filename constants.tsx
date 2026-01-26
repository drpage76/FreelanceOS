
import React from 'react';
import { JobStatus, InvoiceStatus } from './types';

export const STATUS_COLORS: Record<JobStatus | InvoiceStatus, string> = {
  [JobStatus.POTENTIAL]: 'bg-amber-100 text-amber-700 border-amber-200',
  [JobStatus.PENCILLED]: 'bg-orange-100 text-orange-700 border-orange-200',
  [JobStatus.CONFIRMED]: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  [JobStatus.AWAITING_PAYMENT]: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  [JobStatus.COMPLETED]: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-bold',
  [JobStatus.CANCELLED]: 'bg-slate-100 text-slate-700 border-slate-200',
  [InvoiceStatus.DRAFT]: 'bg-slate-100 text-slate-600 border-slate-200',
  [InvoiceStatus.SENT]: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  [InvoiceStatus.PAID]: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  [InvoiceStatus.OVERDUE]: 'bg-rose-100 text-rose-700 border-rose-200',
};

export const CURRENCY_SYMBOL = '£';
export const DATE_DISPLAY_FORMAT = 'dd MMM yy';
