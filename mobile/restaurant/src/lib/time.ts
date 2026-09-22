import { addDays, localDateString } from '@mealdirect/shared';

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Accepts 24-hour "HH:mm", the format the backend validates
export const isValidTime = (value: string) => HH_MM.test(value.trim());

// '18:30:00' from the API -> '18:30' for editing
export const toHHmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : '');

export const isBefore = (start: string, end: string) => start.localeCompare(end) < 0;

export const dayLabel = (date: string, now = new Date()) => {
  if (date === localDateString(now)) return 'Today';
  if (date === localDateString(addDays(now, 1))) return 'Tomorrow';
  if (date === localDateString(addDays(now, -1))) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
