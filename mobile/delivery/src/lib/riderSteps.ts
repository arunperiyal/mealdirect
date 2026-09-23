import { formatINR, localDateString, type Order } from '@mealdirect/shared';

export type RiderStep =
  | { kind: 'action'; action: 'pick-up' | 'deliver'; label: string }
  | { kind: 'waiting'; message: string }
  | { kind: 'done'; message: string };

// Cash the rider must collect at the door (0 when paid online)
export const cashToCollect = (order: Pick<Order, 'paymentMethod' | 'paymentStatus' | 'total'>) =>
  order.paymentMethod === 'cod' && order.paymentStatus !== 'completed' ? Number(order.total) : 0;

export const riderStep = (order: Order): RiderStep => {
  switch (order.status) {
    case 'confirmed':
    case 'preparing':
      return { kind: 'waiting', message: 'The restaurant is preparing this order. Pick it up once it’s marked ready.' };
    case 'ready':
      return { kind: 'action', action: 'pick-up', label: 'Picked up from restaurant' };
    case 'out_for_delivery': {
      const cash = cashToCollect(order);
      return { kind: 'action', action: 'deliver', label: cash ? `Delivered · collected ${formatINR(cash)}` : 'Delivered' };
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

// Today's delivered orders and the cash collected for them
export const todaySummary = (orders: Order[], now = new Date()) => {
  const today = localDateString(now);
  const delivered = orders.filter(
    (o) => o.status === 'delivered' && localDateString(new Date(o.deliveredAt ?? o.createdAt)) === today
  );
  return {
    delivered: delivered.length,
    cash: delivered.filter((o) => o.paymentMethod === 'cod').reduce((sum, o) => sum + Number(o.total), 0),
  };
};

// Opens the phone's maps app searching for the address text. No location
// permission or tracking; live location comes in a later phase.
export const mapsUrl = (...parts: (string | null | undefined)[]) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.filter(Boolean).join(', '))}`;

export const restaurantPlace = (order: Order) =>
  [order.restaurant?.address, order.restaurant?.city].filter(Boolean).join(', ');
