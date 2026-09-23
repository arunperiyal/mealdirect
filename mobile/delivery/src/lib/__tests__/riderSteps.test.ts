import type { Order } from '@mealdirect/shared';
import { canRelease, cashToCollect, isActiveDelivery, mapsUrl, riderStep, todaySummary } from '../riderSteps';

const order = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'o1',
    status: 'confirmed',
    deliveryType: 'delivery',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    total: '282.00',
    items: [],
    statusHistory: [],
    createdAt: new Date(2026, 8, 23, 12).toISOString(),
    ...overrides,
  }) as Order;

describe('riderStep', () => {
  test('waits while the restaurant prepares, then picks up and delivers', () => {
    expect(riderStep(order({ status: 'confirmed' })).kind).toBe('waiting');
    expect(riderStep(order({ status: 'preparing' })).kind).toBe('waiting');
    expect(riderStep(order({ status: 'ready' }))).toMatchObject({ kind: 'action', action: 'pick-up' });
    expect(riderStep(order({ status: 'out_for_delivery' }))).toMatchObject({
      kind: 'action',
      action: 'deliver',
      label: expect.stringMatching(/Delivered · collected ₹282\.00/),
    });
  });

  test('online-paid deliveries have no cash to collect', () => {
    const paid = order({ status: 'out_for_delivery', paymentMethod: 'online', paymentStatus: 'completed' });
    expect(cashToCollect(paid)).toBe(0);
    expect(riderStep(paid)).toMatchObject({ label: 'Delivered' });
  });

  test('finished and cancelled orders', () => {
    expect(riderStep(order({ status: 'delivered' }))).toEqual({ kind: 'done', message: 'Delivered' });
    expect(riderStep(order({ status: 'cancelled', cancellationReason: 'Kitchen closed' }))).toEqual({
      kind: 'done',
      message: 'Cancelled: Kitchen closed',
    });
  });

  test('release is only possible before pickup', () => {
    expect(canRelease({ status: 'ready' })).toBe(true);
    expect(canRelease({ status: 'out_for_delivery' })).toBe(false);
    expect(isActiveDelivery({ status: 'out_for_delivery' })).toBe(true);
    expect(isActiveDelivery({ status: 'delivered' })).toBe(false);
  });
});

describe('todaySummary and maps', () => {
  test('counts deliveries finished today and the cash collected for them', () => {
    const now = new Date(2026, 8, 23, 20);
    const today = new Date(2026, 8, 23, 13).toISOString();
    const yesterday = new Date(2026, 8, 22, 13).toISOString();
    const summary = todaySummary(
      [
        order({ status: 'delivered', deliveredAt: today, total: '100' }),
        order({ status: 'delivered', deliveredAt: today, total: '50', paymentMethod: 'online' }),
        order({ status: 'delivered', deliveredAt: yesterday, total: '999' }),
        order({ status: 'out_for_delivery', total: '70' }),
      ],
      now
    );
    expect(summary).toEqual({ delivered: 2, cash: 100 });
  });

  test('maps link searches the address text', () => {
    expect(mapsUrl('Amma Mess', '12 Main St, Chennai')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Amma%20Mess%2C%2012%20Main%20St%2C%20Chennai'
    );
    expect(mapsUrl(null, '7 Lane')).toContain('query=7%20Lane');
  });
});
