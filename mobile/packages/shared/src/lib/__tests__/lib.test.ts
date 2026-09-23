import { addDays, formatTime, localDateString } from '../dates';
import { estimateTotals, formatINR } from '../money';
import { canCancel, canMarkPickedUp, isActive, needsPayment, paymentLabel, statusSteps } from '../orderStatus';
import { upiPayUrl } from '../upi';
import type { Order } from '../../api/types';
import { validateEmail, validatePassword } from '../validation';

describe('money', () => {
  test('estimate matches the backend formula (5% tax + delivery fee)', () => {
    expect(estimateTotals(200, 'delivery', '30.00')).toEqual({
      subtotal: 200,
      tax: 10,
      deliveryFee: 30,
      total: 240,
    });
  });

  test('pickup has no delivery fee', () => {
    expect(estimateTotals(200, 'pickup', 30).total).toBe(210);
  });

  test('formats rupees with two decimals, accepting strings', () => {
    expect(formatINR('1234.5')).toMatch(/1,234\.50/);
    expect(formatINR(null)).toMatch(/0\.00/);
  });
});

describe('dates', () => {
  test('localDateString uses local calendar fields', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  test('addDays rolls over months', () => {
    expect(localDateString(addDays(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
  });

  test('formatTime renders 12-hour times', () => {
    expect(formatTime('00:15:00')).toBe('12:15 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('19:05:00')).toBe('7:05 PM');
    expect(formatTime(null)).toBe('');
  });
});

describe('orderStatus', () => {
  test('pickup and delivery have different final steps', () => {
    expect(statusSteps('pickup').at(-1)).toBe('picked_up');
    expect(statusSteps('delivery').at(-1)).toBe('delivered');
  });

  test('customers can cancel only pending or confirmed orders', () => {
    expect(canCancel({ status: 'pending' })).toBe(true);
    expect(canCancel({ status: 'confirmed' })).toBe(true);
    expect(canCancel({ status: 'preparing' })).toBe(false);
  });

  test('isActive is false for terminal statuses', () => {
    expect(isActive({ status: 'preparing' })).toBe(true);
    expect(isActive({ status: 'delivered' })).toBe(false);
    expect(isActive({ status: 'cancelled' })).toBe(false);
  });

  test('needsPayment only for unpaid, non-cancelled online orders', () => {
    const base = { paymentMethod: 'online' as const, paymentStatus: 'pending' as const, status: 'pending' as const };
    expect(needsPayment(base)).toBe(true);
    expect(needsPayment({ ...base, paymentStatus: 'failed' })).toBe(true);
    expect(needsPayment({ ...base, paymentStatus: 'completed' })).toBe(false);
    expect(needsPayment({ ...base, paymentMethod: 'cod' })).toBe(false);
    expect(needsPayment({ ...base, status: 'cancelled' })).toBe(false);
  });

  test('picked-up action only for ready pickup orders', () => {
    expect(canMarkPickedUp({ deliveryType: 'pickup', status: 'ready' })).toBe(true);
    expect(canMarkPickedUp({ deliveryType: 'delivery', status: 'ready' })).toBe(false);
  });
});

describe('validation', () => {
  test('email and password rules', () => {
    expect(validateEmail('')).toBeTruthy();
    expect(validateEmail('nope')).toBeTruthy();
    expect(validateEmail(' a@b.co ')).toBeNull();
    expect(validatePassword('1234567')).toBeTruthy();
    expect(validatePassword('12345678')).toBeNull();
  });
});

describe('pay on delivery', () => {
  const cod = (overrides: Partial<Order>) =>
    ({ paymentMethod: 'cod', paymentStatus: 'pending', deliveryType: 'delivery', ...overrides }) as Order;

  test('payment labels follow what was collected', () => {
    expect(paymentLabel(cod({ collectionStatus: 'awaiting' }))).toBe('Pay on delivery (cash or UPI)');
    expect(paymentLabel(cod({ deliveryType: 'pickup' }))).toBe('Pay at pickup (cash or UPI)');
    expect(paymentLabel(cod({ collectionStatus: 'collected', collectionMethod: 'cash' }))).toBe('Paid in cash');
    expect(paymentLabel(cod({ collectionStatus: 'collected', collectionMethod: 'upi' }))).toBe('Paid by UPI');
    expect(paymentLabel(cod({ collectionStatus: 'not_paid' }))).toBe('Not paid');
  });

  test('UPI link carries payee, exact amount and order reference', () => {
    expect(upiPayUrl({ id: 'mealdirect@okbank', name: 'Meal Direct' }, 282, '#AB12CD34')).toBe(
      'upi://pay?pa=mealdirect%40okbank&pn=Meal%20Direct&am=282.00&cu=INR&tn=MealDirect%20order%20%23AB12CD34'
    );
  });
});
