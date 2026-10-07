import type { AxiosInstance } from 'axios';
import { addDays, localDateString } from './dates';
import { saveCsv } from './saveCsv';

export interface StatementPeriod {
  key: string;
  label: string;
  from: string; // YYYY-MM-DD, both days included
  to: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

// Ready-made periods, ending today
export const statementPeriods = (today = new Date()): StatementPeriod[] => {
  const y = today.getFullYear();
  const m = today.getMonth();
  const first = (year: number, month: number) => new Date(year, month, 1);
  const todayString = localDateString(today);
  return [
    { key: 'this-month', label: 'This month', from: localDateString(first(y, m)), to: todayString },
    { key: 'last-month', label: 'Last month', from: localDateString(first(y, m - 1)), to: localDateString(addDays(first(y, m), -1)) },
    { key: 'last-3-months', label: 'Last 3 months', from: localDateString(first(y, m - 2)), to: todayString },
    { key: 'this-year', label: 'This year', from: localDateString(first(y, 0)), to: todayString },
  ];
};

// Mirrors the backend's checks; null when the period is fine
export const validatePeriod = (from: string, to: string): string | null => {
  if (!DATE.test(from) || Number.isNaN(Date.parse(from))) return 'Enter the start date like 2026-09-01';
  if (!DATE.test(to) || Number.isNaN(Date.parse(to))) return 'Enter the end date like 2026-09-30';
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days < 1) return 'The end date is before the start date';
  if (days > MAX_DAYS) return 'A statement covers at most a year';
  return null;
};

/**
 * Download the signed-in user's orders for a period as CSV: the share sheet on a phone
 * (save to Files, send by email...), a download in a browser
 */
export const downloadStatement = async (
  client: AxiosInstance,
  { from, to, restaurantId }: { from: string; to: string; restaurantId?: string }
) => {
  const res = await client.get<string>('/statements', {
    params: { from, to, ...(restaurantId ? { restaurantId } : {}) },
    responseType: 'text',
    // Keep the CSV as text: axios would otherwise try to parse it
    transformResponse: (data) => data,
  });
  await saveCsv(`mealdirect-orders-${from}-to-${to}.csv`, res.data);
};
