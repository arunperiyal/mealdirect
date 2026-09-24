import { formatINR, MAX_ITEM_QUANTITY, type Dish, type MenuItem } from '@mealdirect/shared';
import { limitValue, validateLimit, validateMoney } from './validation';

// The fields a dish has, in "My dishes" and on a menu, as typed in a form
export interface DishDraft {
  name: string;
  description: string;
  price: string;
  maxPerOrder: string; // blank = no limit
  maxPerDay: string;
}

export type DishErrors = Partial<Record<keyof DishDraft, string | null>>;

export const emptyDishDraft: DishDraft = { name: '', description: '', price: '', maxPerOrder: '', maxPerDay: '' };

export const dishDraft = (d: {
  name: string;
  price: MenuItem['price'] | Dish['price'];
  description?: string | null;
  maxPerOrder?: number | null;
  maxPerDay?: number | null;
}): DishDraft => ({
  name: d.name,
  description: d.description ?? '',
  price: String(Number(d.price)),
  maxPerOrder: d.maxPerOrder != null ? String(d.maxPerOrder) : '',
  maxPerDay: d.maxPerDay != null ? String(d.maxPerDay) : '',
});

// Errors to show, or the values to send (null limits clear them)
export const checkDishDraft = (draft: DishDraft) => {
  const errors: DishErrors = {
    name: draft.name.trim() ? null : 'Enter a name',
    price: !draft.price.trim() ? 'Enter a price' : validateMoney(draft.price, 'Price'),
    maxPerOrder: validateLimit(draft.maxPerOrder, MAX_ITEM_QUANTITY),
    maxPerDay: validateLimit(draft.maxPerDay, 100),
  };
  const maxPerOrder = limitValue(draft.maxPerOrder);
  const maxPerDay = limitValue(draft.maxPerDay);
  if (!errors.maxPerOrder && !errors.maxPerDay && maxPerOrder != null && maxPerDay != null && maxPerOrder > maxPerDay) {
    errors.maxPerOrder = 'Can’t be more than the limit per day';
  }
  if (Object.values(errors).some(Boolean)) return { errors, values: null };
  return {
    errors,
    values: {
      name: draft.name.trim(),
      description: draft.description.trim(),
      price: Number(draft.price),
      maxPerOrder,
      maxPerDay,
    },
  };
};

// "₹200 · max 2 per order · 3 a day per person"
export const dishSummary = (item: {
  price: Dish['price'];
  maxPerOrder?: number | null;
  maxPerDay?: number | null;
  available?: boolean;
}) =>
  [
    formatINR(item.price),
    item.maxPerOrder != null && `max ${item.maxPerOrder} per order`,
    item.maxPerDay != null && `${item.maxPerDay} a day per person`,
    item.available === false && 'sold out',
  ]
    .filter(Boolean)
    .join(' · ');
