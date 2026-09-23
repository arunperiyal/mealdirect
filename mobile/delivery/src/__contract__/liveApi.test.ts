/**
 * Contract test against a running backend. Skipped unless LIVE_API_URL is set.
 *
 * Approving riders needs a system admin, which can't self-register. Create one
 * on the backend and pass its credentials:
 *
 *   ADMIN_PASSWORD=... npm run create-admin -- --email admin@example.com   (in backend/)
 *   LIVE_API_ADMIN_EMAIL=admin@example.com LIVE_API_ADMIN_PASSWORD=... \
 *     LIVE_API_URL=http://localhost:3000 npx jest src/__contract__
 *
 * Drives the delivery app's own auth thunk and RTK Query endpoints: signing up,
 * approval, claiming (including two riders racing for one order), pickup and
 * delivery. The admin, restaurant and customer are simulated over plain HTTP.
 */
import axios from 'axios';

const LIVE_API_URL = process.env.LIVE_API_URL;
const describeLive = LIVE_API_URL ? describe : describe.skip;

jest.mock('@/config', () => ({
  API_URL: process.env.LIVE_API_URL ?? 'http://localhost:3000',
  ORDER_POLL_MS: 15000,
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
import { refreshProfile, register } from '@/store/authSlice';
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

describeLive('delivery app ↔ live backend', () => {
  const store = makeStore();
  const call = <T>(action: { unwrap: () => Promise<T> }) => action.unwrap();
  const d = store.dispatch;
  const e = serverApi.endpoints;

  let adminAuth: ReturnType<typeof bearer>;
  let ownerAuth: ReturnType<typeof bearer>;
  let customerAuth: ReturnType<typeof bearer>;
  let otherRiderAuth: ReturnType<typeof bearer>;
  let restaurantId: string;
  let menuId: string;
  let itemId: string;

  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const admin = await http.post('/auth/login', {
      email: process.env.LIVE_API_ADMIN_EMAIL,
      password: process.env.LIVE_API_ADMIN_PASSWORD,
    });
    adminAuth = bearer(admin.data.data.accessToken);

    const owner = await http.post('/auth/register', {
      email: `owner.${unique}@contract.test`,
      password: 'Password123!',
      firstName: 'Kavya',
      lastName: 'Owner',
      role: 'restaurant_admin',
    });
    ownerAuth = bearer(owner.data.data.accessToken);
    restaurantId = (
      await http.post(
        '/restaurants',
        { name: `Rider Kitchen ${unique}`, email: `rk.${unique}@contract.test`, address: '5 Market Rd', city: 'Chennai', ...PAYOUT },
        ownerAuth
      )
    ).data.data.id;
    await http.put(`/restaurants/admin/${restaurantId}/approve`, {}, adminAuth);
    await http.put(`/restaurants/${restaurantId}/delivery-settings`, { deliveryEnabled: true, pickupEnabled: true }, ownerAuth);
    menuId = (await http.post('/menus', { restaurantId, date: today }, ownerAuth)).data.data.id;
    itemId = (await http.post(`/menus/${menuId}/items`, { items: [{ name: 'Biryani', price: 200 }] }, ownerAuth)).data.data
      .items[0].id;
    await http.post(`/menus/${menuId}/publish`, {}, ownerAuth);

    const customer = await http.post('/auth/register', {
      email: `diner.${unique}@contract.test`,
      password: 'Password123!',
      firstName: 'Priya',
      lastName: 'Diner',
      phone: '9123456780',
    });
    customerAuth = bearer(customer.data.data.accessToken);

    const other = await http.post('/auth/register', {
      email: `rider2.${unique}@contract.test`,
      password: 'Password123!',
      firstName: 'Arjun',
      lastName: 'Rider',
      phone: '9000000002',
      role: 'delivery_partner',
    });
    otherRiderAuth = bearer(other.data.data.accessToken);
    await http.put(`/admin/riders/${other.data.data.user.id}/approve`, {}, adminAuth);
  });

  afterAll(() => {
    store.dispatch(serverApi.util.resetApiState());
  });

  const confirmedOrder = async () => {
    const order = (
      await http.post(
        '/orders',
        {
          restaurantId,
          menuId,
          items: [{ menuItemId: itemId, quantity: 1 }],
          deliveryType: 'delivery',
          deliveryAddress: '22 Beach Rd',
          paymentMethod: 'cod',
        },
        customerAuth
      )
    ).data.data;
    await http.post(`/orders/${order.id}/confirm`, {}, ownerAuth);
    return order;
  };

  test('signs up as a rider and waits for approval', async () => {
    await store
      .dispatch(
        register({
          email: `rider1.${unique}@contract.test`,
          password: 'Password123!',
          firstName: 'Ravi',
          lastName: 'Rider',
          phone: '9000000001',
        })
      )
      .unwrap();
    expect(store.getState().auth.user).toMatchObject({ role: 'delivery_partner', riderStatus: 'pending' });

    const blocked = await d(e.getAvailable.initiate());
    expect('error' in blocked && blocked.error).toMatchObject({ code: 'RIDER_NOT_APPROVED', status: 403 });

    // Before approval, payout details save at once
    const payout = await call(
      d(e.updatePayout.initiate({ upiId: 'ravi@okaxis', bankAccountName: 'Ravi Rider', bankAccountNumber: '555566667777', bankIFSC: 'UTIB0001234' }))
    );
    expect(payout).toMatchObject({ applied: true, profile: { upiId: 'ravi@okaxis' } });

    await http.put(`/admin/riders/${store.getState().auth.user!.id}/approve`, {}, adminAuth);
    await store.dispatch(refreshProfile()).unwrap();
    expect(store.getState().auth.user?.riderStatus).toBe('approved');
  });

  test('after approval, a change of phone waits for an admin', async () => {
    const sent = await call(d(e.updatePersonal.initiate({ firstName: 'Ravi', lastName: 'Rider', phone: '9000000009' })));
    expect(sent).toMatchObject({ applied: false, changeRequest: { status: 'pending', changes: { phone: '9000000009' } } });
    let profile = await call(d(e.getProfile.initiate(undefined, { forceRefetch: true })));
    expect(profile.phone).toBe('9000000001');

    await http.post(`/admin/change-requests/${sent.changeRequest!.id}/approve`, {}, adminAuth);
    profile = await call(d(e.getProfile.initiate(undefined, { forceRefetch: true })));
    expect(profile).toMatchObject({ phone: '9000000009', upiId: 'ravi@okaxis' });
    expect(profile.changeRequests.personal).toBeNull();
  });

  test('sees an accepted order in the queue without the customer phone', async () => {
    const order = await confirmedOrder();
    const queue = await call(d(e.getAvailable.initiate(undefined, { forceRefetch: true })));
    const queued = queue.find((o) => o.id === order.id)!;
    expect(queued.restaurant).toMatchObject({ name: `Rider Kitchen ${unique}`, address: '5 Market Rd' });
    expect(queued.customer).toEqual({ id: expect.any(String), firstName: 'Priya' });
  });

  test('when two riders race for one order on Postgres, exactly one wins', async () => {
    const order = await confirmedOrder();
    const results = await Promise.all([
      d(e.act.initiate({ id: order.id, action: 'claim' })),
      http.post(`/delivery/orders/${order.id}/claim`, {}, { ...otherRiderAuth, validateStatus: () => true }),
    ]);
    const appWon = !('error' in results[0]);
    const otherWon = results[1].status === 200;
    expect(appWon !== otherWon).toBe(true);

    const loserCode = appWon ? results[1].data.code : (results[0] as { error: { code: string } }).error.code;
    expect(loserCode).toBe('ALREADY_CLAIMED');
  });

  test('claims, waits for ready, picks up and delivers; cash is recorded and everyone sees the rider', async () => {
    const order = await confirmedOrder();
    const claimed = await call(d(e.act.initiate({ id: order.id, action: 'claim' })));
    expect(claimed.customer?.phone).toBe('9123456780');
    // Customers paying by UPI at the door pay the restaurant
    const detail = await call(d(e.getDelivery.initiate(order.id, { forceRefetch: true })));
    expect(detail.restaurant?.upiId).toBe(PAYOUT.upiId);

    const early = await d(e.act.initiate({ id: order.id, action: 'pick-up' }));
    expect('error' in early && early.error).toMatchObject({ code: 'INVALID_STATUS' });

    await http.post(`/orders/${order.id}/mark-preparing`, {}, ownerAuth);
    await http.post(`/orders/${order.id}/mark-ready`, {}, ownerAuth);
    const restaurantTries = await http.post(`/orders/${order.id}/mark-out-for-delivery`, {}, { ...ownerAuth, validateStatus: () => true });
    expect(restaurantTries.data.code).toBe('RIDER_ASSIGNED');

    await call(d(e.act.initiate({ id: order.id, action: 'pick-up' })));
    const customerView = (await http.get(`/orders/${order.id}`, customerAuth)).data.data;
    expect(customerView.status).toBe('out_for_delivery');
    // The phone number approved in the earlier test
    expect(customerView.rider).toMatchObject({ firstName: 'Ravi', phone: '9000000009' });

    const done = await call(d(e.act.initiate({ id: order.id, action: 'deliver', collection: 'cash' })));
    expect(done).toMatchObject({ status: 'delivered', paymentStatus: 'completed', collectionMethod: 'cash' });

    const cash = await call(d(e.getBalance.initiate(undefined, { forceRefetch: true })));
    expect(cash.balance).toBeGreaterThanOrEqual(Number(order.total));
    expect(cash.overdue).toBe(0);

    const mine = await call(d(e.getMyDeliveries.initiate(undefined, { forceRefetch: true })));
    expect(mine.map((o) => o.id)).toContain(order.id);
  });

  test('not paid: recorded by the rider, and the customer is blocked from ordering', async () => {
    const order = await confirmedOrder();
    await call(d(e.act.initiate({ id: order.id, action: 'claim' })));
    await http.post(`/orders/${order.id}/mark-preparing`, {}, ownerAuth);
    await http.post(`/orders/${order.id}/mark-ready`, {}, ownerAuth);
    await call(d(e.act.initiate({ id: order.id, action: 'pick-up' })));
    const done = await call(d(e.act.initiate({ id: order.id, action: 'deliver', collection: 'not_paid', note: 'No answer' })));
    expect(done).toMatchObject({ collectionStatus: 'not_paid' });

    const blocked = await http.post(
      '/orders',
      { restaurantId, menuId, items: [{ menuItemId: itemId, quantity: 1 }], deliveryType: 'delivery', deliveryAddress: '22 Beach Rd', paymentMethod: 'cod' },
      { ...customerAuth, validateStatus: () => true }
    );
    expect(blocked.data.code).toBe('PAYMENT_OVERDUE');

    // An admin resolves it and the customer can order again
    await http.post(`/admin/orders/${order.id}/resolve-payment`, { outcome: 'written_off', note: 'Contract test' }, adminAuth);
    expect((await confirmedOrder()).id).toBeTruthy();
  });

  test('releases an order back to the queue', async () => {
    const order = await confirmedOrder();
    await call(d(e.act.initiate({ id: order.id, action: 'claim' })));
    const released = await call(d(e.act.initiate({ id: order.id, action: 'release' })));
    expect(released.riderId).toBeNull();
    const queue = await call(d(e.getAvailable.initiate(undefined, { forceRefetch: true })));
    expect(queue.map((o) => o.id)).toContain(order.id);
  });
});
