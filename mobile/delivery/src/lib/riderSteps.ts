import { formatINR, localDateString, type Order } from '@mealdirect/shared';

export type RiderStep =
  | { kind: 'action'; action: 'pick-up' | 'deliver'; label: string }
  | { kind: 'waiting'; message: string }
  | { kind: 'done'; message: string };

// Amount the rider collects at the door, in cash or by UPI: 0 when paid online
// or once the payment has been recorded (collected or not paid)
export const cashToCollect = (order: Pick<Order, 'paymentMethod' | 'collectionStatus' | 'total'>) =>
  order.paymentMethod === 'cod' && (order.collectionStatus ?? 'awaiting') === 'awaiting' ? Number(order.total) : 0;

export const riderStep = (order: Order): RiderStep => {
  switch (order.status) {
    case 'confirmed':
    case 'preparing':
      return { kind: 'waiting', message: 'The restaurant is preparing this order. Pick it up once it’s marked ready.' };
    case 'ready':
      return { kind: 'action', action: 'pick-up', label: 'Picked up from restaurant' };
    case 'out_for_delivery': {
      const due = cashToCollect(order);
      // Pay-on-delivery orders open the payment step (cash, UPI or not paid)
      return { kind: 'action', action: 'deliver', label: due ? `Delivered · collect ${formatINR(due)}` : 'Delivered' };
    }
    case 'delivered':
      return { kind: 'done', message: 'Delivered' };
    case 'cancelled':
      return { kind: 'done', message: order.cancellationReason ? `Cancelled: ${order.cancellationReason}` : 'Cancelled' };
    default:
      return { kind: 'waiting', message: 'Waiting for the restaurant' };
  }
};

// Riders can hand an order back until they've picked it up
export const canRelease = (order: Pick<Order, 'status'>) => ['confirmed', 'preparing', 'ready'].includes(order.status);

export const isActiveDelivery = (order: Pick<Order, 'status'>) =>
  ['confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(order.status);

// How many deliveries were finished today. Money totals come from the backend
// (GET /api/delivery/balance), which knows what was paid by cash or UPI.
export const deliveredToday = (orders: Order[], now = new Date()) => {
  const today = localDateString(now);
  return orders.filter((o) => o.status === 'delivered' && localDateString(new Date(o.deliveredAt ?? o.createdAt)) === today)
    .length;
};

// Opens the phone's maps app searching for the address text. No location
// permission or tracking; live location comes in a later phase.
export const mapsUrl = (...parts: (string | null | undefined)[]) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.filter(Boolean).join(', '))}`;

export const restaurantPlace = (order: Order) =>
  [order.restaurant?.address, order.restaurant?.city].filter(Boolean).join(', ');
