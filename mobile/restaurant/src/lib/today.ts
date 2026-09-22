import { localDateString, type Order } from '@mealdirect/shared';
import { ACTIVE_STATUSES, COMPLETED_STATUSES, needsAttention } from './orderActions';

export interface TodaySummary {
  newOrders: number; // waiting for the restaurant to accept
  inProgress: number;
  completed: number;
  cancelled: number;
  revenue: number; // placed today and not cancelled
}

export const summarizeToday = (orders: Order[], now = new Date()): TodaySummary => {
  const today = localDateString(now);
  const todays = orders.filter((o) => localDateString(new Date(o.createdAt)) === today);
  const count = (statuses: readonly string[]) => todays.filter((o) => statuses.includes(o.status)).length;

  return {
    newOrders: todays.filter(needsAttention).length,
    inProgress: count(ACTIVE_STATUSES) - todays.filter(needsAttention).length,
    completed: count(COMPLETED_STATUSES),
    cancelled: count(['cancelled']),
    revenue: todays.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + Number(o.total), 0),
  };
};
