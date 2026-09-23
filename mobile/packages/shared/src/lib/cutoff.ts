import { formatTime } from './dates';
import type { Menu } from '../api/types';

// Mirrors backend/src/lib/ordering.js: orders close at the ordering end time on
// the menu's day; past days are closed; later days are open. Uses the phone's
// clock and date, which for customers in India matches the business timezone.
export const orderingState = (
  menu: Pick<Menu, 'date' | 'orderingEndTime'>,
  today: string,
  now: Date = new Date()
): { open: boolean; label: string | null } => {
  if (menu.date < today) return { open: false, label: 'Ordering has closed for this day' };
  if (!menu.orderingEndTime) return { open: true, label: null };
  const [h, m] = menu.orderingEndTime.split(':').map(Number);
  const closesToday = menu.date === today && now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  return closesToday
    ? { open: false, label: `Orders closed at ${formatTime(menu.orderingEndTime)}` }
    : { open: true, label: `Order by ${formatTime(menu.orderingEndTime)}${menu.date === today ? ' today' : ''}` };
};
