/**
 * Contract test against a running backend. Skipped unless LIVE_API_URL is set.
 *
 * Restaurant approval needs a system admin, which can't self-register. Create
 * one on the backend and pass its credentials:
 *
 *   ADMIN_PASSWORD=... npm run create-admin -- --email admin@example.com   (in backend/)
 *   LIVE_API_ADMIN_EMAIL=admin@example.com LIVE_API_ADMIN_PASSWORD=... \
 *     LIVE_API_URL=http://localhost:3000 npx jest src/__contract__
 *
 * Set LIVE_API_SQLITE=1 when the backend runs on SQLite: restaurant search uses
 * Postgres-only ILIKE there and is skipped.
 *
 * Seeds a restaurant and menu over plain HTTP, then drives the app's own auth
 * thunks and RTK Query endpoints so request shapes and response parsing are
 * checked against the real server rather than mocks.
 */
import axios from 'axios';

const LIVE_API_URL = process.env.LIVE_API_URL;
const describeLive = LIVE_API_URL ? describe : describe.skip;

jest.mock('@/config', () => ({
  API_URL: process.env.LIVE_API_URL ?? 'http://localhost:3000',
  ORDER_POLL_MS: 5000,
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

// Imported after the mocks above are registered
/* eslint-disable import/first */
import { api } from '@/api';
import { addDays, estimateTotals, localDateString } from '@mealdirect/shared';
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

const loginAdmin = async () => {
  const email = process.env.LIVE_API_ADMIN_EMAIL;
  const password = process.env.LIVE_API_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set LIVE_API_ADMIN_EMAIL and LIVE_API_ADMIN_PASSWORD (see the comment at the top)');
  }
  const res = await http.post('/auth/login', { email, password });
  return { headers: { Authorization: `Bearer ${res.data.data.accessToken}` } };
};

const registerAs = async (role: string) => {
  const res = await http.post('/auth/register', {
    email: `${role}.${unique}@contract.test`,
    password: 'Password123!',
    firstName: 'Contract',
    lastName: role,
    role,
  });
  return { headers: { Authorization: `Bearer ${res.data.data.accessToken}` }, user: res.data.data.user };
};

describeLive('customer app ↔ live backend', () => {
  const store = makeStore();
  const run = <T>(thunk: { unwrap: () => Promise<T> }) => thunk.unwrap();

  let restaurantId: string;
  let menuId: string;
  let itemIds: string[];
  let slotId: string;

  beforeAll(async () => {
    const owner = await registerAs('restaurant_admin');
    const admin = await loginAdmin();

    const restaurant = await http.post(
      '/restaurants',
      {
        name: `Contract Kitchen ${unique}`,
        email: `kitchen.${unique}@contract.test`,
        address: '12 Test Street',
        city: 'Chennai',
        description: 'Seeded by the customer app contract test',
      },
      { headers: owner.headers }
    );
    restaurantId = restaurant.data.data.id;
    await http.put(`/restaurants/admin/${restaurantId}/approve`, {}, { headers: admin.headers });
    await http.put(
      `/restaurants/${restaurantId}/delivery-settings`,
      { deliveryEnabled: true, pickupEnabled: true, defaultDeliveryFee: 30 },
      { headers: owner.headers }
    );

    const menu = await http.post('/menus', { restaurantId, date: today }, { headers: owner.headers });
    menuId = menu.data.data.id;
    const withItems = await http.post(
      `/menus/${menuId}/items`,
      {
        items: [
          { name: 'South Indian Meals', description: 'Rice, sambar, rasam, 2 curries', price: 120, quantity: 50 },
          { name: 'Curd Rice', description: 'With pickle', price: 60, quantity: 30 },
        ],
      },
      { headers: owner.headers }
    );
    itemIds = withItems.data.data.items.map((i: { id: string }) => i.id);
    const slot = await http.post(
      `/menus/${menuId}/slots`,
      { restaurantId, startTime: '12:30', endTime: '13:00', maxOrders: 10 },
      { headers: owner.headers }
    );
    slotId = slot.data.data.id;
    await http.post(`/menus/${menuId}/publish`, {}, { headers: owner.headers });
  }, 30000);

  test('registers a customer through the auth thunk', async () => {
    await run(
      store.dispatch(
        register({
          email: `customer.${unique}@contract.test`,
          password: 'Password123!',
          firstName: 'Priya',
          lastName: 'Contract',
        })
      )
    );
    expect(store.getState().auth.status).toBe('signedIn');
    expect(store.getState().auth.user?.role).toBe('customer');
  });

  afterAll(() => {
    // Drop RTK Query cache timers so nothing fires after Jest tears down
    store.dispatch(serverApi.util.resetApiState());
  });

  test('lists only approved restaurants', async () => {
    const all = await run(store.dispatch(serverApi.endpoints.getRestaurants.initiate({})));
    expect(all.some((r) => r.id === restaurantId)).toBe(true);
    expect(all.every((r) => r.isApproved)).toBe(true);
  });

  (process.env.LIVE_API_SQLITE ? test.skip : test)('searches restaurants by name', async () => {
    const searched = await run(
      store.dispatch(serverApi.endpoints.getRestaurants.initiate({ search: `Kitchen ${unique}` }))
    );
    expect(searched.map((r) => r.id)).toEqual([restaurantId]);
  });

  test("loads today's published menu and its delivery slots", async () => {
    const menus = await run(
      store.dispatch(serverApi.endpoints.getPublishedMenus.initiate({ restaurantId, date: today }))
    );
    expect(menus).toHaveLength(1);
    expect(menus[0].items.map((i) => i.name)).toEqual(['South Indian Meals', 'Curd Rice']);
    expect(menus[0].items.every((i) => typeof i.price === 'number' || typeof i.price === 'string')).toBe(true);

    const tomorrow = await run(
      store.dispatch(
        serverApi.endpoints.getPublishedMenus.initiate({
          restaurantId,
          date: localDateString(addDays(new Date(), 1)),
        })
      )
    );
    expect(tomorrow).toEqual([]);

    const slots = await run(store.dispatch(serverApi.endpoints.getMenuSlots.initiate(menuId)));
    expect(slots.map((s) => s.id)).toContain(slotId);
  });

  test('places a COD delivery order whose total matches the client estimate', async () => {
    const order = await run(
      store.dispatch(
        serverApi.endpoints.createOrder.initiate({
          restaurantId,
          menuId,
          items: [
            { menuItemId: itemIds[0], quantity: 2 },
            { menuItemId: itemIds[1], quantity: 1 },
          ],
          deliveryType: 'delivery',
          deliverySlotId: slotId,
          deliveryAddress: 'Flat 4B, Contract Towers',
          paymentMethod: 'cod',
        })
      )
    );

    const estimate = estimateTotals(300, 'delivery', 30);
    expect(Number(order.subtotal)).toBeCloseTo(estimate.subtotal);
    expect(Number(order.tax)).toBeCloseTo(estimate.tax);
    expect(Number(order.deliveryFee)).toBeCloseTo(estimate.deliveryFee);
    expect(Number(order.total)).toBeCloseTo(estimate.total);
    expect(order.status).toBe('pending');

    const mine = await run(store.dispatch(serverApi.endpoints.getMyOrders.initiate()));
    expect(mine.map((o) => o.id)).toContain(order.id);

    const cancelled = await run(
      store.dispatch(serverApi.endpoints.cancelOrder.initiate({ id: order.id, reason: 'Contract test' }))
    );
    expect(cancelled.status).toBe('cancelled');
  });

  test('places a pickup order without an address', async () => {
    const order = await run(
      store.dispatch(
        serverApi.endpoints.createOrder.initiate({
          restaurantId,
          menuId,
          items: [{ menuItemId: itemIds[1], quantity: 1 }],
          deliveryType: 'pickup',
          paymentMethod: 'cod',
        })
      )
    );
    expect(order.deliveryType).toBe('pickup');
    expect(Number(order.deliveryFee)).toBe(0);

    const fetched = await run(store.dispatch(serverApi.endpoints.getOrder.initiate(order.id)));
    expect(fetched.id).toBe(order.id);
  });

  test('online payment is off: the app is told so and online orders are refused', async () => {
    const config = await run(store.dispatch(serverApi.endpoints.getConfig.initiate()));
    expect(config.onlinePayments).toBe(false);

    const result = await store.dispatch(
      serverApi.endpoints.createOrder.initiate({
        restaurantId,
        menuId,
        items: [{ menuItemId: itemIds[0], quantity: 1 }],
        deliveryType: 'pickup',
        paymentMethod: 'online',
      })
    );
    expect('error' in result && result.error).toMatchObject({ code: 'ONLINE_PAYMENTS_DISABLED', status: 400 });
  });
});
