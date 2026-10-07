import { addDays, formatTime, localDateString, type Menu } from '@mealdirect/shared';

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

// For sentences: "today", "tomorrow", "yesterday" or "on Wed, 8 Oct"
export const dayPhrase = (date: string, now = new Date()) => {
  const label = dayLabel(date, now);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(label) ? label.toLowerCase() : `on ${label}`;
};

// 'YYYY-MM-DD' moved by whole days
export const shiftDate = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return localDateString(new Date(y, m - 1, d + days));
};

// Ordering window times fall on the menu's day (0) or the day before (-1)
export type OrderingDay = 0 | -1;

const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Mirrors the backend: ordering must close after it opens
export const closesAfterOpens = (start: string, opensDay: OrderingDay, end: string, closesDay: OrderingDay) =>
  opensDay * 24 * 60 + minutes(start) < closesDay * 24 * 60 + minutes(end);

// "8:00 PM the day before – 6:00 AM", for the menu list and the menu screen
export const orderingWindowLabel = (
  menu: Pick<Menu, 'orderingStartTime' | 'orderingEndTime' | 'orderingOpensDay' | 'orderingClosesDay'>
) => {
  const at = (time: string, day: number | null | undefined) => `${formatTime(time)}${day === -1 ? ' the day before' : ''}`;
  if (menu.orderingStartTime && menu.orderingEndTime) {
    return `${at(menu.orderingStartTime, menu.orderingOpensDay)} – ${at(menu.orderingEndTime, menu.orderingClosesDay)}`;
  }
  return menu.orderingEndTime ? `until ${at(menu.orderingEndTime, menu.orderingClosesDay)}` : null;
};
