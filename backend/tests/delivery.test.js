const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  updateDeliverySettings,
  createMenu,
  publishMenu,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;
let adminHeaders, customerHeaders, ownerHeaders;
let rider, riderHeaders, rider2Headers, pendingRiderHeaders;
let restaurant, menu;

const signUpRider = async (email, phone = '9876500000') => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'TestPass123!', firstName: 'Ravi', lastName: 'Rider', phone, role: 'delivery_partner' });
  expect(res.status).toBe(201);
  return { user: res.body.data.user, headers: getAuthHeaders({ accessToken: res.body.data.accessToken }) };
};

describe('Delivery partners', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'dl-admin@test.com', 'system_admin')).tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'dl-cust@test.com', 'customer')).tokens);
    const owner = await registerAndLogin(app, 'dl-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Rider Test Kitchen' });
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, { deliveryEnabled: true, pickupEnabled: true });
    menu = await createMenu(app, restaurant.id, ownerHeaders);
    menu = await publishMenu(app, menu.id, ownerHeaders);

    const r1 = await signUpRider('rider1@test.com');
    rider = r1.user;
    riderHeaders = r1.headers;
    rider2Headers = (await signUpRider('rider2@test.com', '9876500001')).headers;
    pendingRiderHeaders = (await signUpRider('rider3@test.com', '9876500002')).headers;

    for (const r of [rider, (await models.User.findOne({ where: { email: 'rider2@test.com' } }))]) {
      const res = await request(app).put(`/api/admin/riders/${r.id}/approve`).set(adminHeaders);
      expect(res.status).toBe(200);
    }
  });

  afterEach(async () => {
    await models.Order.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const placeOrder = async (overrides = {}) => {
    const res = await request(app)
      .post('/api/orders')
      .set(customerHeaders)
      .send({
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType: 'delivery',
        deliveryAddress: '7 Rider Lane',
        paymentMethod: 'cod',
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.data;
  };

  const restaurantDoes = (orderId, action) =>
    request(app).post(`/api/orders/${orderId}/${action}`).set(ownerHeaders);
  const riderDoes = (orderId, action, headers = riderHeaders) =>
    request(app).post(`/api/delivery/orders/${orderId}/${action}`).set(headers);

  const confirmed = async (overrides) => {
    const order = await placeOrder(overrides);
    expect((await restaurantDoes(order.id, 'confirm')).status).toBe(200);
    return order;
  };

  describe('sign-up and approval', () => {
    test('riders sign up with a phone number and start pending', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'nophone@test.com', password: 'TestPass123!', firstName: 'N', lastName: 'P', role: 'delivery_partner' });
      expect(res.status).toBe(400);

      const me = await request(app).get('/api/auth/me').set(pendingRiderHeaders);
      expect(me.body.data.user).toMatchObject({ role: 'delivery_partner', riderStatus: 'pending', phone: '9876500002' });
    });

    test('pending riders cannot see or claim orders', async () => {
      await confirmed();
      const res = await request(app).get('/api/delivery/available').set(pendingRiderHeaders);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('RIDER_NOT_APPROVED');
    });

    test('other roles cannot use delivery endpoints', async () => {
      expect((await request(app).get('/api/delivery/available').set(customerHeaders)).status).toBe(403);
      expect((await request(app).get('/api/delivery/available').set(ownerHeaders)).status).toBe(403);
    });

    test('admins list riders by status and can suspend and re-approve', async () => {
      const list = await request(app).get('/api/admin/riders?status=pending').set(adminHeaders);
      expect(list.status).toBe(200);
      expect(list.body.data.map((r) => r.email)).toEqual(['rider3@test.com']);
      expect(list.body.meta.counts).toEqual({ pending: 1, approved: 2, suspended: 0 });

      const suspend = await request(app).put(`/api/admin/riders/${rider.id}/suspend`).set(adminHeaders);
      expect(suspend.body.data.riderStatus).toBe('suspended');
      expect((await request(app).get('/api/delivery/available').set(riderHeaders)).status).toBe(403);

      await request(app).put(`/api/admin/riders/${rider.id}/approve`).set(adminHeaders);
      expect((await request(app).get('/api/delivery/available').set(riderHeaders)).status).toBe(200);
    });

    test('only riders can be approved as riders', async () => {
      const customer = await models.User.findOne({ where: { email: 'dl-cust@test.com' } });
      const res = await request(app).put(`/api/admin/riders/${customer.id}/approve`).set(adminHeaders);
      expect(res.status).toBe(404);
    });
  });

  describe('the queue and claiming', () => {
    test('shows confirmed delivery orders with pickup and drop details; not pickup or unaccepted ones', async () => {
      const deliverable = await confirmed();
      await confirmed({ deliveryType: 'pickup', deliveryAddress: undefined });
      await placeOrder(); // still pending: the restaurant hasn't accepted it

      const res = await request(app).get('/api/delivery/available').set(riderHeaders);
      expect(res.status).toBe(200);
      expect(res.body.data.map((o) => o.id)).toEqual([deliverable.id]);
      expect(res.body.data[0].restaurant).toMatchObject({ name: 'Rider Test Kitchen', address: '123 Main St' });
      expect(res.body.data[0].deliveryAddress).toBe('7 Rider Lane');
      expect(res.body.data[0].customer.firstName).toBe('Customer');
    });

    test('the first rider to claim gets the order; the second is told it is taken', async () => {
      const order = await confirmed();

      const [first, second] = await Promise.all([riderDoes(order.id, 'claim'), riderDoes(order.id, 'claim', rider2Headers)]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = first.status === 409 ? first : second;
      expect(loser.body.code).toBe('ALREADY_CLAIMED');

      const saved = await models.Order.findByPk(order.id);
      expect(saved.riderId).toBeTruthy();

      const queue = await request(app).get('/api/delivery/available').set(riderHeaders);
      expect(queue.body.data).toEqual([]);
    });

    test('a rider can hold at most 3 active orders', async () => {
      for (let i = 0; i < 3; i++) {
        const o = await confirmed();
        expect((await riderDoes(o.id, 'claim')).status).toBe(200);
      }
      const fourth = await confirmed();
      const res = await riderDoes(fourth.id, 'claim');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TOO_MANY_ACTIVE');
    });

    test('releasing before pickup puts the order back in the queue', async () => {
      const order = await confirmed();
      await riderDoes(order.id, 'claim');
      const res = await riderDoes(order.id, 'release');
      expect(res.status).toBe(200);
      expect(res.body.data.riderId).toBeNull();
      const queue = await request(app).get('/api/delivery/available').set(rider2Headers);
      expect(queue.body.data.map((o) => o.id)).toEqual([order.id]);
    });
  });

  describe('delivering', () => {
    test('rider picks up a ready order and delivers it; cash is recorded as collected', async () => {
      const order = await confirmed();
      await riderDoes(order.id, 'claim');

      // Not ready yet
      expect((await riderDoes(order.id, 'pick-up')).status).toBe(400);

      await restaurantDoes(order.id, 'mark-preparing');
      await restaurantDoes(order.id, 'mark-ready');

      // The restaurant can't send out an order a rider has claimed
      const restaurantSends = await restaurantDoes(order.id, 'mark-out-for-delivery');
      expect(restaurantSends.status).toBe(409);
      expect(restaurantSends.body.code).toBe('RIDER_ASSIGNED');

      // Another rider can't touch it
      expect((await riderDoes(order.id, 'pick-up', rider2Headers)).status).toBe(403);

      const picked = await riderDoes(order.id, 'pick-up');
      expect(picked.status).toBe(200);
      expect(picked.body.data.status).toBe('out_for_delivery');
      expect((await riderDoes(order.id, 'release')).status).toBe(400);

      const delivered = await riderDoes(order.id, 'deliver');
      expect(delivered.status).toBe(200);
      expect(delivered.body.data).toMatchObject({ status: 'delivered', paymentStatus: 'completed' });

      const saved = await models.Order.findByPk(order.id);
      expect(saved.statusHistory.map((h) => h.status)).toEqual([
        'pending',
        'confirmed',
        'preparing',
        'ready',
        'out_for_delivery',
        'delivered',
      ]);
      expect(saved.statusHistory.at(-1).changedBy).toBe(rider.id);
    });

    test("everyone sees the rider's name and phone on the order", async () => {
      const order = await confirmed();
      await riderDoes(order.id, 'claim');

      for (const headers of [customerHeaders, ownerHeaders, adminHeaders]) {
        const res = await request(app).get(`/api/orders/${order.id}`).set(headers);
        expect(res.body.data.rider).toEqual({ id: rider.id, firstName: 'Ravi', lastName: 'Rider', phone: '9876500000' });
      }
    });

    test("my deliveries lists the rider's own orders, newest first", async () => {
      const a = await confirmed();
      const b = await confirmed();
      await riderDoes(a.id, 'claim');
      await riderDoes(b.id, 'claim', rider2Headers);

      const res = await request(app).get('/api/delivery/orders').set(riderHeaders);
      expect(res.body.data.map((o) => o.id)).toEqual([a.id]);
    });

    test('restaurants can still deliver orders themselves when no rider has claimed them', async () => {
      const order = await confirmed();
      for (const action of ['mark-preparing', 'mark-ready', 'mark-out-for-delivery', 'mark-delivered']) {
        expect((await restaurantDoes(order.id, action)).status).toBe(200);
      }
      const saved = await models.Order.findByPk(order.id);
      expect(saved.paymentStatus).toBe('completed');
    });
  });
});
