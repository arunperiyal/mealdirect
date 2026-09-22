/**
 * Contract test against a running backend. Skipped unless LIVE_API_URL is set.
 *
 * Approving the new restaurant needs a system admin, which can't self-register.
 * Create one on the backend and pass its credentials:
 *
 *   ADMIN_PASSWORD=... npm run create-admin -- --email admin@example.com   (in backend/)
 *   LIVE_API_ADMIN_EMAIL=admin@example.com LIVE_API_ADMIN_PASSWORD=... \
 *     LIVE_API_URL=http://localhost:3000 npx jest src/__contract__
 *
 * Drives the restaurant app's own auth thunks and RTK Query endpoints through
 * onboarding, menu setup and a full order lifecycle; a customer is simulated
 * over plain HTTP.
 */
import axios from 'axios';

const LIVE_API_URL = process.env.LIVE_API_URL;
const describeLive = LIVE_API_URL ? describe : describe.skip;

jest.mock('@/config', () => ({
  API_URL: process.env.LIVE_API_URL ?? 'http://localhost:3000',
  ORDER_POLL_MS: 10000,
}));

// In-memory stand-in for SecureStore
jest.mock('@mealdirect/shared', () => {
  const mem: Record<string, string | null> = {};
  const session = {
    getAccessToken: async () => mem.access ?? null,
    getRefreshToken: async () => mem.refresh ?? null,
    setAccessToken: async (t: string) => {
      mem.access = t;
    },
    saveTokens: async ({ accessToken, refreshToken }: { accessToken: string; refreshToken: string }) => {
      mem.access = accessToken;
      mem.refresh = refreshToken;
    },
    clearTokens: async () => {
      mem.access = null;
      mem.refresh = null;
    },
    saveUser: async () => {},
    getUser: async () => null,
    clearSession: async () => {
      mem.access = null;
      mem.refresh = null;
    },
  };
  return { ...jest.requireActual('@mealdirect/shared'), session };
});

/* eslint-disable import/first */
import { localDateString } from '@mealdirect/shared';
import { api } from '@/api';
import { makeStore } from '@/store';
import { register } from '@/store/authSlice';
import { serverApi } from '@/store/serverApi';
/* eslint-enable import/first */

// Jest's React Native environment resolves axios's browser build, which has no
// real network transport. Borrow the HTTP adapter from axios's Node build.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeAxios: typeof axios = require('axios/dist/node/axios.cjs');
const httpAdapter = nodeAxios.getAdapter('http');
api.defaults.adapter = httpAdapter;
axios.defaults.adapter = httpAdapter;

const http = nodeAxios.create({ baseURL: `${LIVE_API_URL}/api` });
const unique = Date.now().toString(36);
const today = localDateString(new Date());
const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describeLive('restaurant app ↔ live backend', () => {
  const store = makeStore();
  const run = <T>(thunk: { unwrap: () => Promise<T> }) => thunk.unwrap();
  const call = <T>(action: { unwrap: () => Promise<T> }) => action.unwrap();
  const d = store.dispatch;
  const e = serverApi.endpoints;

  let adminAuth: ReturnType<typeof bearer>;
  let customerAuth: ReturnType<typeof bearer>;
  let restaurantId: string;
  let menuId: string;
  let itemIds: string[];
  let slotId: string;

  beforeAll(async () => {
    const admin = await http.post('/auth/login', {
      email: process.env.LIVE_API_ADMIN_EMAIL,
      password: process.env.LIVE_API_ADMIN_PASSWORD,
    });
    adminAuth = bearer(admin.data.data.accessToken);

    const customer = await http.post('/auth/register', {
      email: `diner.${unique}@contract.test`,
      password: 'Password123!',
      firstName: 'Priya',
      lastName: 'Diner',
    });
    customerAuth = bearer(customer.data.data.accessToken);
  });

  afterAll(() => {
    store.dispatch(serverApi.util.resetApiState());
  });

  const placeOrder = async (body: Record<string, unknown>) =>
    (
      await http.post(
        '/orders',
        { restaurantId, menuId, items: [{ menuItemId: itemIds[0], quantity: 2 }], ...body },
        customerAuth
      )
    ).data.data;

  test('a new partner signs up and adds a restaurant, which waits for approval', async () => {
    await run(
      d(register({ email: `owner.${unique}@contract.test`, password: 'Password123!', firstName: 'Ravi', lastName: 'Owner' }))
    );
    expect(store.getState().auth.user?.role).toBe('restaurant_admin');

    expect(await call(d(e.getMyRestaurants.initiate()))).toEqual([]);

    const created = await call(
      d(
        e.createRestaurant.initiate({
          name: `Partner Kitchen ${unique}`,
          email: `kitchen.${unique}@contract.test`,
          phone: '9876543210',
          address: '12 Test Street',
          city: 'Chennai',
        })
      )
    );
    restaurantId = created.id;
    expect(created.isApproved).toBe(false);

    // Menus are blocked until approval
    const early = await d(e.createMenu.initiate({ restaurantId, date: today }));
    expect('error' in early && early.error).toMatchObject({ status: 403 });

    await http.put(`/restaurants/admin/${restaurantId}/approve`, {}, adminAuth);
    const [approved] = await call(d(e.getMyRestaurants.initiate(undefined, { forceRefetch: true })));
    expect(approved).toMatchObject({ id: restaurantId, isApproved: true, verificationStatus: 'verified' });
  });

  test('settings: delivery and payout details save, and payout details stay private', async () => {
    await call(
      d(
        e.updateDeliverySettings.initiate({
          id: restaurantId,
          deliveryEnabled: true,
          pickupEnabled: true,
          defaultDeliveryFee: 30,
          minOrderForDelivery: 0,
        })
      )
    );
    await call(d(e.updateBankDetails.initiate({ id: restaurantId, bankAccountNumber: '123456789012', bankIFSC: 'HDFC0001234' })));
    const [mine] = await call(d(e.getMyRestaurants.initiate(undefined, { forceRefetch: true })));
    expect(mine).toMatchObject({ deliveryEnabled: true, bankAccountNumber: '123456789012' });
    expect(Number(mine.defaultDeliveryFee)).toBe(30);

    const publicView = (await http.get(`/restaurants/${restaurantId}`)).data.data;
    expect(publicView.bankAccountNumber).toBeUndefined();
  });

  test("sets up and publishes today's menu with dishes and a delivery time", async () => {
    const menu = await call(
      d(e.createMenu.initiate({ restaurantId, date: today, orderingStartTime: '08:00', orderingEndTime: '22:00' }))
    );
    menuId = menu.id;

    await call(d(e.addMenuItem.initiate({ menuId, item: { name: 'South Indian Meals', price: 120 } })));
    const withItems = await call(d(e.addMenuItem.initiate({ menuId, item: { name: 'Curd Rice', price: 60, description: 'With pickle' } })));
    itemIds = withItems.items.map((i) => i.id);

    const slot = await call(d(e.addSlot.initiate({ menuId, startTime: '12:30', endTime: '13:00', maxOrders: 2 })));
    slotId = slot.id;

    const published = await call(d(e.setMenuStatus.initiate({ id: menuId, action: 'publish' })));
    expect(published.status).toBe('published');

    const listed = await call(d(e.getMenus.initiate({ restaurantId, from: today, to: today })));
    expect(listed.map((m) => m.id)).toEqual([menuId]);
  });

  test('sold out and removed dishes are saved', async () => {
    await call(d(e.updateMenuItem.initiate({ menuId, itemId: itemIds[1], changes: { available: false } })));
    let menu = await call(d(e.getMenu.initiate(menuId, { forceRefetch: true })));
    expect(menu.items.find((i) => i.id === itemIds[1])?.available).toBe(false);

    const extra = await call(d(e.addMenuItem.initiate({ menuId, item: { name: 'Temporary', price: 10 } })));
    const extraId = extra.items.find((i) => i.name === 'Temporary')!.id;
    await call(d(e.removeMenuItem.initiate({ menuId, itemId: extraId })));
    menu = await call(d(e.getMenu.initiate(menuId, { forceRefetch: true })));
    expect(menu.items.map((i) => i.id)).toEqual(itemIds);
  });

  test('takes a delivery order from new to delivered, seeing who ordered and when', async () => {
    const placed = await placeOrder({
      deliveryType: 'delivery',
      deliverySlotId: slotId,
      deliveryAddress: 'Flat 4B, Contract Towers',
      paymentMethod: 'cod',
      customerNotes: 'Less spicy',
    });

    const orders = await call(d(e.getRestaurantOrders.initiate({ restaurantId }, { forceRefetch: true })));
    const incoming = orders.find((o) => o.id === placed.id)!;
    expect(incoming.customer).toMatchObject({ firstName: 'Priya', lastName: 'Diner' });
    expect(incoming.deliverySlot?.startTime).toMatch(/^12:30/);
    expect(Number(incoming.total)).toBeCloseTo(120 * 2 * 1.05 + 30);

    for (const action of ['confirm', 'mark-preparing', 'mark-ready', 'mark-out-for-delivery', 'mark-delivered'] as const) {
      await call(d(e.advanceOrder.initiate({ id: placed.id, action })));
    }
    const done = await call(d(e.getOrder.initiate(placed.id, { forceRefetch: true })));
    expect(done.status).toBe('delivered');
    expect(done.statusHistory.map((h) => h.status)).toEqual([
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'out_for_delivery',
      'delivered',
    ]);
  });

  test('cannot accept an unpaid online order; can cancel with a reason', async () => {
    const online = await placeOrder({ deliveryType: 'pickup', paymentMethod: 'online' });
    const accept = await d(e.advanceOrder.initiate({ id: online.id, action: 'confirm' }));
    expect('error' in accept && accept.error).toMatchObject({ code: 'PAYMENT_PENDING', status: 409 });

    const cancelled = await call(d(e.cancelOrder.initiate({ id: online.id, reason: 'Item sold out' })));
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'Item sold out' });
  });

  test('delivery time capacity cannot drop below booked orders', async () => {
    await placeOrder({ deliveryType: 'delivery', deliverySlotId: slotId, deliveryAddress: 'Somewhere', paymentMethod: 'cod' });
    const shrink = await d(e.updateSlot.initiate({ id: slotId, maxOrders: 1 }));
    expect('error' in shrink && shrink.error).toMatchObject({ status: 400 });
  });
});
