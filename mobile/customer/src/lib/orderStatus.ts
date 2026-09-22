import type { DeliveryType, Order, OrderStatus } from '@/api/types';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Order placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
};

const DELIVERY_STEPS: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
];
const PICKUP_STEPS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'];

export const statusSteps = (deliveryType: DeliveryType) =>
  deliveryType === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;

const TERMINAL: OrderStatus[] = ['delivered', 'picked_up', 'cancelled'];

export const isActive = (order: Pick<Order, 'status'>) => !TERMINAL.includes(order.status);

// Mirrors the backend rule in orderController.cancelOrder for customers
export const canCancel = (order: Pick<Order, 'status'>) =>
  order.status === 'pending' || order.status === 'confirmed';

export const needsPayment = (order: Pick<Order, 'paymentMethod' | 'paymentStatus' | 'status'>) =>
  order.paymentMethod !== 'cod' && order.paymentStatus !== 'completed' && order.status !== 'cancelled';

export const canMarkPickedUp = (order: Pick<Order, 'deliveryType' | 'status'>) =>
  order.deliveryType === 'pickup' && order.status === 'ready';
