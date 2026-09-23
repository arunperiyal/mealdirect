import type { MenuItem, Order } from '../api/types';

// Mirrors backend/src/lib/itemLimits.js: any one dish is capped at 20 per order,
// and a restaurant can set lower limits per order and per customer per day.
export const MAX_ITEM_QUANTITY = 20;

type Limits = Pick<MenuItem, 'maxPerOrder' | 'maxPerDay'>;

/**
 * How many of a dish this customer can have in their next order, and a short note
 * about the limits ("Max 2 per order · 1 left today"). `orderedBefore` is what
 * they already ordered from this menu, which is one day's food.
 */
export const dishAllowance = (item: Limits, orderedBefore = 0) => {
  const perOrder = Math.min(item.maxPerOrder ?? MAX_ITEM_QUANTITY, MAX_ITEM_QUANTITY);
  const leftForDay = item.maxPerDay != null ? Math.max(item.maxPerDay - orderedBefore, 0) : null;
  const max = leftForDay == null ? perOrder : Math.min(perOrder, leftForDay);

  const notes: string[] = [];
  if (item.maxPerOrder != null) notes.push(`Max ${item.maxPerOrder} per order`);
  if (item.maxPerDay != null) {
    notes.push(
      orderedBefore > 0
        ? `${leftForDay} of your ${item.maxPerDay} for the day left`
        : `Max ${item.maxPerDay} per person a day`
    );
  }
  return { max, note: notes.length ? notes.join(' · ') : null };
};

// How much of each dish a customer has in active orders from one menu
export const orderedFromMenu = (orders: Pick<Order, 'menuId' | 'status' | 'items'>[], menuId: string) => {
  const totals = new Map<string, number>();
  for (const o of orders) {
    if (o.menuId !== menuId || o.status === 'cancelled') continue;
    for (const i of o.items) totals.set(i.menuItemId, (totals.get(i.menuItemId) ?? 0) + i.quantity);
  }
  return totals;
};
