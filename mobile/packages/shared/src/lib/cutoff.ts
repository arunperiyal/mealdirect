import { addDays, formatTime, localDateString } from './dates';
import type { Menu } from '../api/types';

type WindowFields = Pick<Menu, 'date' | 'orderingEndTime'> &
  Partial<Pick<Menu, 'orderingStartTime' | 'orderingOpensDay' | 'orderingClosesDay'>>;

// 'YYYY-MM-DD' plus a day offset and an 'HH:mm[:ss]' time, as a moment on the phone's clock
const moment = (date: string, dayOffset: number, time: string) => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  return new Date(y, mo - 1, d + dayOffset, h, m);
};

// " today", " tomorrow", or nothing for other days
const dayWord = (at: Date, now: Date) => {
  const day = localDateString(at);
  if (day === localDateString(now)) return ' today';
  if (day === localDateString(addDays(now, 1))) return ' tomorrow';
  return '';
};

// Mirrors backend/src/lib/ordering.js: orders are taken from the opening to the closing
// time, each on the menu's day or the day before (overnight ordering). The opening is
// enforced only with orderingOpensDay set. Past days are closed. Uses the phone's clock
// and date, which for customers in India matches the business timezone.
export const orderingState = (
  menu: WindowFields,
  today: string,
  now: Date = new Date()
): { open: boolean; label: string | null; opensLater?: boolean } => {
  if (menu.date < today) return { open: false, label: 'Ordering has closed for this day' };

  const closesAt = menu.orderingEndTime ? moment(menu.date, menu.orderingClosesDay ?? 0, menu.orderingEndTime) : null;
  if (closesAt && now >= closesAt) {
    return { open: false, label: `Orders closed at ${formatTime(menu.orderingEndTime)}` };
  }
  if (menu.orderingStartTime && menu.orderingOpensDay != null) {
    const opensAt = moment(menu.date, menu.orderingOpensDay, menu.orderingStartTime);
    if (now < opensAt) {
      return {
        open: false,
        opensLater: true,
        label: `Orders open at ${formatTime(menu.orderingStartTime)}${dayWord(opensAt, now)}`,
      };
    }
  }
  return closesAt
    ? { open: true, label: `Order by ${formatTime(menu.orderingEndTime)}${dayWord(closesAt, now)}` }
    : { open: true, label: null };
};
