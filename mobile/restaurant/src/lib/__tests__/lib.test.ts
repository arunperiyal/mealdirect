import type { Order } from '@mealdirect/shared';
import { canRecordPayment, canRestaurantCancel, customerName, nextStep, paymentLabel } from '../orderActions';
import { bulkResultMessage, countsSummary, groupTitle, kitchenCounts } from '../kitchen';
import { summarizeToday } from '../today';
import { dayLabel, isBefore, isValidTime, toHHmm } from '../time';
import { validateMoney, validatePhone } from '../validation';

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'abcdef12-0000-0000-0000-000000000000',
    status: 'pending',
    deliveryType: 'delivery',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    total: '100.00',
    createdAt: new Date(2026, 8, 23, 12, 0).toISOString(),
    items: [],
    statusHistory: [],
    ...overrides,
  }) as Order;

describe('nextStep', () => {
  test('walks a delivery order through every action', () => {
    const steps = (['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] as const).map(
      (status) => nextStep(order({ status }))
    );
    expect(steps.map((s) => (s.kind === 'action' ? s.action : s.kind))).toEqual([
      'confirm',
      'mark-preparing',
      'mark-ready',
      'mark-out-for-delivery',
      'mark-delivered',
    ]);
  });

  test('orders a delivery partner has claimed wait for them', () => {
    const rider = { id: 'r', firstName: 'Ravi', lastName: 'K', phone: '9' };
    expect(nextStep(order({ status: 'ready', riderId: 'r', rider }))).toEqual({
      kind: 'waiting',
      message: 'Ready. Ravi K is coming to pick it up.',
    });
    expect(nextStep(order({ status: 'out_for_delivery', riderId: 'r', rider }))).toEqual({
      kind: 'waiting',
      message: 'On the way with Ravi K.',
    });
  });

  test('ready pickup orders wait for the customer', () => {
    expect(nextStep(order({ status: 'ready', deliveryType: 'pickup' })).kind).toBe('waiting');
  });

  test('unpaid online orders cannot be accepted yet', () => {
    const step = nextStep(order({ paymentMethod: 'online' }));
    expect(step).toEqual({ kind: 'waiting', message: expect.stringMatching(/pay online/) });
    expect(nextStep(order({ paymentMethod: 'online', paymentStatus: 'completed' })).kind).toBe('action');
  });

  test('finished orders have nothing to do', () => {
    for (const status of ['delivered', 'picked_up', 'cancelled'] as const) {
      expect(nextStep(order({ status }))).toEqual({ kind: 'done' });
    }
  });
});

describe('order helpers', () => {
  test('restaurants can cancel until the food leaves', () => {
    expect(canRestaurantCancel({ status: 'ready' })).toBe(true);
    expect(canRestaurantCancel({ status: 'out_for_delivery' })).toBe(false);
  });

  test('payment labels', () => {
    expect(paymentLabel(order())).toBe('Pay on delivery (cash or UPI)');
    expect(paymentLabel(order({ deliveryType: 'pickup' }))).toBe('Pay at pickup (cash or UPI)');
    expect(paymentLabel(order({ collectionStatus: 'collected', collectionMethod: 'cash' }))).toBe('Paid in cash');
    expect(paymentLabel(order({ paymentMethod: 'online', paymentStatus: 'completed' }))).toBe('Paid online');
    expect(paymentLabel(order({ paymentMethod: 'online', paymentStatus: 'failed' }))).toBe('Online payment failed');
  });

  test('customer name falls back when missing', () => {
    expect(customerName(order({ customer: { id: 'u', firstName: 'Priya', lastName: null, phone: null } }))).toBe('Priya');
    expect(customerName(order())).toBe('Customer');
  });
});

describe('canRecordPayment', () => {
  test('pickup once ready, self-delivery once delivered; never rider deliveries or online orders', () => {
    expect(canRecordPayment(order({ deliveryType: 'pickup', status: 'ready', collectionStatus: 'awaiting' }))).toBe(true);
    expect(canRecordPayment(order({ deliveryType: 'pickup', status: 'preparing' }))).toBe(false);
    expect(canRecordPayment(order({ status: 'delivered', collectionStatus: 'awaiting' }))).toBe(true);
    expect(canRecordPayment(order({ status: 'delivered', riderId: 'r1' }))).toBe(false);
    expect(canRecordPayment(order({ status: 'delivered', collectionStatus: 'collected' }))).toBe(false);
    expect(canRecordPayment(order({ status: 'delivered', paymentMethod: 'online' }))).toBe(false);
  });
});

describe('summarizeToday', () => {
  const now = new Date(2026, 8, 23, 18, 0);
  const yesterday = new Date(2026, 8, 22, 12, 0).toISOString();

  test('counts only today and leaves cancelled orders out of sales', () => {
    const summary = summarizeToday(
      [
        order({ status: 'pending', total: '100' }),
        order({ status: 'pending', paymentMethod: 'online', total: '50' }), // awaiting payment
        order({ status: 'preparing', total: '200' }),
        order({ status: 'delivered', total: '300' }),
        order({ status: 'cancelled', total: '999' }),
        order({ status: 'delivered', total: '1000', createdAt: yesterday }),
      ],
      now
    );
    expect(summary).toEqual({ newOrders: 1, inProgress: 2, completed: 1, cancelled: 1, revenue: 650 });
  });
});

describe('time and validation', () => {
  test('time helpers', () => {
    expect(isValidTime('08:00')).toBe(true);
    expect(isValidTime('8:00')).toBe(false);
    expect(isValidTime('24:00')).toBe(false);
    expect(toHHmm('18:30:00')).toBe('18:30');
    expect(isBefore('12:00', '12:30')).toBe(true);
    expect(isBefore('12:30', '12:30')).toBe(false);
  });

  test('day labels', () => {
    const now = new Date(2026, 8, 23, 10);
    expect(dayLabel('2026-09-23', now)).toBe('Today');
    expect(dayLabel('2026-09-24', now)).toBe('Tomorrow');
    expect(dayLabel('2026-09-22', now)).toBe('Yesterday');
    expect(dayLabel('2026-09-27', now)).toMatch(/27/);
  });

  test('form validators', () => {
    expect(validatePhone('')).toBeNull();
    expect(validatePhone('98765 43210')).toBeNull();
    expect(validatePhone('123')).toBeTruthy();
    expect(validateMoney('-1', 'Fee')).toBeTruthy();
    expect(validateMoney('25.50', 'Fee')).toBeNull();
  });
});

describe('kitchen helpers', () => {
  test('counts preparing orders as accepted, and finished ones as done', () => {
    const c = kitchenCounts({ pending: 1, confirmed: 2, preparing: 1, ready: 3, delivered: 1, picked_up: 1 });
    expect(c).toEqual({ new: 1, accepted: 3, ready: 3, done: 2 });
    expect(countsSummary(c)).toBe('1 new · 3 accepted · 3 ready · 2 done');
    expect(countsSummary(kitchenCounts({ ready: 2 }))).toBe('2 ready');
  });

  test('names groups by delivery time or pickup', () => {
    expect(groupTitle({ kind: 'slot', slot: { id: 's', startTime: '19:30:00', endTime: '20:00:00' } })).toBe(
      'Delivery 7:30 PM–8:00 PM'
    );
    expect(groupTitle({ kind: 'unscheduled', slot: null })).toBe('Delivery (no time chosen)');
    expect(groupTitle({ kind: 'pickup', slot: null })).toBe('Pickup');
  });

  test('reports bulk results, including orders still waiting for payment', () => {
    expect(bulkResultMessage('accept', { updated: 3, skipped: 1 }, 'Pickup')).toBe(
      'Pickup: 3 orders accepted. 1 order still waiting for online payment.'
    );
    expect(bulkResultMessage('ready', { updated: 0, skipped: 0 }, 'Pickup')).toBe('Pickup: nothing to mark ready.');
  });
});
