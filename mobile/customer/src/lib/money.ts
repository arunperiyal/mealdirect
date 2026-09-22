import type { DeliveryType } from '@/api/types';

// Must match backend/src/controllers/orderController.js createOrder
export const TAX_RATE = 0.05;

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// The backend returns DECIMAL columns as strings on Postgres
export const formatINR = (amount: number | string | null | undefined) =>
  inr.format(Number(amount ?? 0));

export interface Estimate {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
}

// Client-side preview only; the server recalculates the real total when the order is placed
export const estimateTotals = (
  subtotal: number,
  deliveryType: DeliveryType,
  defaultDeliveryFee: number | string | null | undefined
): Estimate => {
  const tax = subtotal * TAX_RATE;
  const deliveryFee = deliveryType === 'delivery' ? Number(defaultDeliveryFee ?? 0) : 0;
  return { subtotal, tax, deliveryFee, total: subtotal + tax + deliveryFee };
};
