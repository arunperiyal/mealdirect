/**
 * Contract test against a running backend. Skipped unless LIVE_API_URL is set.
 *
 * Signs in as a system admin, which can't self-register. Create one on the
 * backend and pass its credentials:
 *
 *   ADMIN_PASSWORD=... npm run create-admin -- --email admin@example.com   (in backend/)
 *   LIVE_API_ADMIN_EMAIL=admin@example.com LIVE_API_ADMIN_PASSWORD=... \
 *     LIVE_API_URL=http://localhost:3000 npx jest src/__contract__
 *
 * Drives the admin app's own auth thunk and RTK Query endpoints: reviewing a
 * restaurant, analytics, and orders. A restaurant owner and customers are
 * simulated over plain HTTP.
 */
import axios from 'axios';

const LIVE_API_URL = process.env.LIVE_API_URL;
const describeLive = LIVE_API_URL ? describe : describe.skip;

jest.mock('@/config', () => ({
  API_URL: process.env.LIVE_API_URL ?? 'http://localhost:3000',
  ORDER_POLL_MS: 30000,
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
import { api } from '@/api';
import { makeStore } from '@/store';
import { login } from '@/store/authSlice';
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
const PAYOUT = {
  upiId: 'contractkitchen@okhdfc',
  bankAccountName: 'Contract Kitchen',
  bankAccountNumber: '123456789012',
  bankIFSC: 'HDFC0001234',
};
const unique = Date.now().toString(36);
const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describeLive('admin app ↔ live backend', () => {
  const store = makeStore();
  const call = <T>(action: { unwrap: () => Promise<T> }) => action.unwrap();
  const d = store.dispatch;
  const e = serverApi.endpoints;
  const tzOffset = -new Date().getTimezoneOffset();

  let ownerAuth: ReturnType<typeof bearer>;
  const customers: ReturnType<typeof bearer>[] = [];
  let restaurantId: string;
  let menuId: string;
  let itemId: string;

  beforeAll(async () => {
    const owner = await http.post('/auth/register', {
      email: `owner.${unique}@contract.test`,
      password: 'Password123!',
      firstName: 'Ravi',
      lastName: 'Owner',
      role: 'restaurant_admin',
    });
    ownerAuth = bearer(owner.data.data.accessToken);
    const created = await http.post(
      '/restaurants',
      { name: `Review Kitchen ${unique}`, email: `rk.${unique}@contract.test`, city: 'Chennai' },
      ownerAuth
    );
    restaurantId = created.data.data.id;

    for (const n of [1, 2]) {
      const c = await http.post('/auth/register', {
        email: `diner${n}.${unique}@contract.test`,
        password: 'Password123!',
        firstName: `Diner${n}`,
        lastName: 'Test',
      });
      customers.push(bearer(c.data.data.accessToken));
    }
  });

  afterAll(() => {
    store.dispatch(serverApi.util.resetApiState());
  });

  test('signs in as a system admin through the auth thunk', async () => {
    await store
      .dispatch(login({ email: process.env.LIVE_API_ADMIN_EMAIL!, password: process.env.LIVE_API_ADMIN_PASSWORD! }))
      .unwrap();
    expect(store.getState().auth.user?.role).toBe('system_admin');
  });

  test('finds the new restaurant in the review queue with its owner, and it is hidden from the public', async () => {
    const { restaurants, counts } = await call(d(e.getRestaurants.initiate({ status: 'pending', search: unique })));
    expect(restaurants.map((r) => r.id)).toEqual([restaurantId]);
    expect(restaurants[0].owner).toMatchObject({ firstName: 'Ravi', email: `owner.${unique}@contract.test` });
    expect(counts.pending).toBeGreaterThanOrEqual(1);

    expect((await http.get(`/restaurants/${restaurantId}`, { validateStatus: () => true })).status).toBe(404);
  });

  test('rejects with a note, then approves once payout details are in', async () => {
    await call(d(e.reviewRestaurant.initiate({ id: restaurantId, decision: 'reject', notes: 'Add FSSAI licence' })));
    let detail = await call(d(e.getRestaurant.initiate(restaurantId, { forceRefetch: true })));
    expect(detail.restaurant).toMatchObject({ verificationStatus: 'rejected', verificationNotes: 'Add FSSAI licence' });

    const early = await d(e.reviewRestaurant.initiate({ id: restaurantId, decision: 'approve', notes: '' }));
    expect('error' in early && early.error).toMatchObject({ code: 'PAYOUT_DETAILS_MISSING', status: 409 });
    // Not approved yet, so the owner's details apply at once
    await http.put(`/restaurants/${restaurantId}/bank-details`, PAYOUT, ownerAuth);

    await call(d(e.reviewRestaurant.initiate({ id: restaurantId, decision: 'approve', notes: '' })));
    detail = await call(d(e.getRestaurant.initiate(restaurantId, { forceRefetch: true })));
    expect(detail.restaurant).toMatchObject({ verificationStatus: 'verified', isApproved: true });

    const publicView = (await http.get(`/restaurants/${restaurantId}`)).data.data;
    expect(publicView.name).toBe(`Review Kitchen ${unique}`);
    expect(publicView.owner).toBeUndefined();
    expect(publicView.upiId).toBeUndefined();
  });

  test('reviews a payout change from the live restaurant', async () => {
    const sent = await http.put(`/restaurants/${restaurantId}/bank-details`, { ...PAYOUT, upiId: 'newkitchen@oksbi' }, ownerAuth);
    expect(sent.status).toBe(202);

    const queue = await call(d(e.getChangeRequests.initiate(undefined, { forceRefetch: true })));
    const mine = queue.find((q) => q.subject?.id === restaurantId)!;
    expect(mine).toMatchObject({
      subjectType: 'restaurant',
      kind: 'payout',
      changes: { upiId: 'newkitchen@oksbi' },
      current: { upiId: PAYOUT.upiId },
    });

    await call(d(e.reviewChange.initiate({ id: mine.id, decision: 'approve' })));
    const detail = await call(d(e.getRestaurant.initiate(restaurantId, { forceRefetch: true })));
    expect(detail.restaurant.upiId).toBe('newkitchen@oksbi');
  });

  test('analytics count the restaurant’s sales today, excluding cancelled orders', async () => {
    const today = new Date(Date.now() + tzOffset * 60000).toISOString().slice(0, 10);
    const menu = await http.post('/menus', { restaurantId, date: today }, ownerAuth);
    menuId = menu.data.data.id;
    const withItems = await http.post(`/menus/${menuId}/items`, { items: [{ name: 'Thali', price: 150 }] }, ownerAuth);
    itemId = withItems.data.data.items[0].id;
    await http.post(`/menus/${menuId}/publish`, {}, ownerAuth);

    const place = (auth: ReturnType<typeof bearer>, quantity: number) =>
      http
        .post(
          '/orders',
          { restaurantId, menuId, items: [{ menuItemId: itemId, quantity }], deliveryType: 'pickup', paymentMethod: 'cod' },
          auth
        )
        .then((r) => r.data.data);
    const kept = [await place(customers[0], 1), await place(customers[0], 2)];
    const toCancel = await place(customers[1], 1);
    await call(d(e.cancelOrder.initiate({ id: toCancel.id, reason: 'Contract test' })));

    const analytics = await call(d(e.getAnalytics.initiate({ days: 7, tzOffset }, { forceRefetch: true })));
    expect(analytics.byDay).toHaveLength(7);
    expect(analytics.range.to).toBe(today);

    const mine = analytics.topRestaurants.find((r) => r.id === restaurantId);
    const expected = kept.reduce((sum, o) => sum + Number(o.total), 0);
    expect(mine).toMatchObject({ name: `Review Kitchen ${unique}`, orders: 2 });
    expect(mine!.revenue).toBeCloseTo(expected);
    expect(analytics.totals.repeatCustomers).toBeGreaterThanOrEqual(1);
    expect(analytics.users.partners).toBeGreaterThanOrEqual(1);
  });

  test('lists orders with restaurant and customer names, and shows the cancellation', async () => {
    const orders = await call(d(e.getOrders.initiate(undefined, { forceRefetch: true })));
    const ours = orders.filter((o) => o.restaurantId === restaurantId);
    expect(ours).toHaveLength(3);
    expect(ours[0].restaurant?.name).toBe(`Review Kitchen ${unique}`);
    expect(ours.some((o) => o.status === 'cancelled' && o.cancellationReason === 'Contract test')).toBe(true);
    expect(ours.map((o) => o.customer?.firstName).sort()).toEqual(['Diner1', 'Diner1', 'Diner2']);
  });
});
