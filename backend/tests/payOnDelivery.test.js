// Online payment is on hold in production; test that behaviour here
process.env.ONLINE_PAYMENTS_ENABLED = 'false';
process.env.MEALDIRECT_UPI_ID = 'mealdirect@okbank';
process.env.MEALDIRECT_UPI_NAME = 'MealDirect';

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
let adminHeaders, customerHeaders, customer2Headers, ownerHeaders;
let rider, riderHeaders;
let restaurant, menu;

describe('Pay on delivery', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'pod-admin@test.com', 'system_admin')).tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'pod-cust@test.com', 'customer')).tokens);
    customer2Headers = getAuthHeaders((await registerAndLogin(app, 'pod-cust2@test.com', 'customer')).tokens);
    const owner = await registerAndLogin(app, 'pod-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Cash Kitchen' });
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, { deliveryEnabled: true, pickupEnabled: true });
    menu = await createMenu(app, restaurant.id, ownerHeaders);
    menu = await publishMenu(app, menu.id, ownerHeaders);

    const signup = await request(app).post('/api/auth/register').send({
      email: 'pod-rider@test.com',
      password: 'TestPass123!',
      firstName: 'Ravi',
      lastName: 'Rider',
      phone: '9876500010',
      role: 'delivery_partner',
    });
    rider = signup.body.data.user;
    riderHeaders = getAuthHeaders({ accessToken: signup.body.data.accessToken });
    await request(app).put(`/api/admin/riders/${rider.id}/approve`).set(adminHeaders);
  });

  afterEach(async () => {
    await models.Settlement.destroy({ where: {}, force: true });
    await models.Order.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const place = async (headers = customerHeaders, overrides = {}) => {
    const res = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType: 'delivery',
        deliveryAddress: '9 Cash Street',
        paymentMethod: 'cod',
        ...overrides,
      });
    return res;
  };

  const restaurantDoes = (id, action, body) =>
    request(app).post(`/api/orders/${id}/${action}`).set(ownerHeaders).send(body ?? {});
  const riderDoes = (id, action, body) =>
    request(app).post(`/api/delivery/orders/${id}/${action}`).set(riderHeaders).send(body ?? {});

  // A delivery order taken all the way to the customer's door by the rider
  const atTheDoor = async (headers = customerHeaders) => {
    const order = (await place(headers)).body.data;
    await restaurantDoes(order.id, 'confirm');
    expect((await riderDoes(order.id, 'claim')).status).toBe(200);
    await restaurantDoes(order.id, 'mark-preparing');
    await restaurantDoes(order.id, 'mark-ready');
    await riderDoes(order.id, 'pick-up');
    return order;
  };

  describe('app settings', () => {
    test('online payment is off and the MealDirect UPI ID is published', async () => {
      const res = await request(app).get('/api/config');
      expect(res.body.data).toEqual({ onlinePayments: false, upi: { id: 'mealdirect@okbank', name: 'MealDirect' } });
    });

    test('online orders are refused while online payment is off', async () => {
      const res = await place(customerHeaders, { paymentMethod: 'online' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ONLINE_PAYMENTS_DISABLED');
    });

    test('new cash orders await collection', async () => {
      const res = await place();
      expect(res.body.data).toMatchObject({ collectionStatus: 'awaiting', paymentStatus: 'pending' });
    });
  });

  describe('rider records payment at the door', () => {
    test('delivering a cash order requires saying how it was paid', async () => {
      const order = await atTheDoor();
      const res = await riderDoes(order.id, 'deliver');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COLLECTION_REQUIRED');
    });

    test('cash: paid, and counted in the rider’s cash to settle', async () => {
      const order = await atTheDoor();
      const res = await riderDoes(order.id, 'deliver', { collection: 'cash' });
      expect(res.body.data).toMatchObject({
        status: 'delivered',
        paymentStatus: 'completed',
        collectionStatus: 'collected',
        collectionMethod: 'cash',
        collectedById: rider.id,
      });

      const balance = await request(app).get('/api/delivery/balance').set(riderHeaders);
      expect(balance.body.data).toMatchObject({ balance: Number(order.total), overdue: 0, cashToday: Number(order.total) });
    });

    test('UPI goes to MealDirect, so the rider has nothing to settle', async () => {
      const order = await atTheDoor();
      await riderDoes(order.id, 'deliver', { collection: 'upi' });
      const balance = await request(app).get('/api/delivery/balance').set(riderHeaders);
      expect(balance.body.data).toMatchObject({ balance: 0, upiToday: Number(order.total) });
    });

    test('not paid: the customer cannot order again until an admin resolves it', async () => {
      const order = await atTheDoor();
      const res = await riderDoes(order.id, 'deliver', { collection: 'not_paid', note: 'Customer said they would pay later' });
      expect(res.body.data).toMatchObject({ status: 'delivered', collectionStatus: 'not_paid', paymentStatus: 'failed' });

      const blocked = await place();
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('PAYMENT_OVERDUE');

      // Other customers are unaffected
      expect((await place(customer2Headers)).status).toBe(201);

      const listed = await request(app).get('/api/orders/admin/orders?collection=not_paid').set(adminHeaders);
      expect(listed.body.data.map((o) => o.id)).toEqual([order.id]);

      const noNote = await request(app)
        .post(`/api/admin/orders/${order.id}/resolve-payment`)
        .set(adminHeaders)
        .send({ outcome: 'collected', method: 'upi' });
      expect(noNote.status).toBe(400);

      const resolved = await request(app)
        .post(`/api/admin/orders/${order.id}/resolve-payment`)
        .set(adminHeaders)
        .send({ outcome: 'collected', method: 'upi', note: 'Customer paid MealDirect UPI next morning' });
      expect(resolved.body.data).toMatchObject({ collectionStatus: 'collected', paymentStatus: 'completed' });
      expect((await place()).status).toBe(201);
    });

    test('an admin can write off an unpaid order, which also unblocks the customer', async () => {
      const order = await atTheDoor();
      await riderDoes(order.id, 'deliver', { collection: 'not_paid' });
      const res = await request(app)
        .post(`/api/admin/orders/${order.id}/resolve-payment`)
        .set(adminHeaders)
        .send({ outcome: 'written_off', note: 'Goodwill after a late delivery' });
      expect(res.body.data.collectionStatus).toBe('written_off');
      expect((await place()).status).toBe(201);

      const again = await request(app)
        .post(`/api/admin/orders/${order.id}/resolve-payment`)
        .set(adminHeaders)
        .send({ outcome: 'written_off', note: 'twice' });
      expect(again.status).toBe(409);
    });
  });

  describe('settling cash with MealDirect', () => {
    const makeCashYesterday = async () => {
      const order = await atTheDoor();
      await riderDoes(order.id, 'deliver', { collection: 'cash' });
      await models.Order.update(
        { collectedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        { where: { id: order.id } }
      );
      return Number(order.total);
    };

    test('unsettled cash from before today stops the rider from accepting orders', async () => {
      const owed = await makeCashYesterday();

      const balance = await request(app).get('/api/delivery/balance').set(riderHeaders);
      expect(balance.body.data).toMatchObject({ balance: owed, overdue: owed });

      const next = (await place()).body.data;
      await restaurantDoes(next.id, 'confirm');
      const claim = await riderDoes(next.id, 'claim');
      expect(claim.status).toBe(403);
      expect(claim.body.code).toBe('SETTLEMENT_OVERDUE');

      const riders = await request(app).get('/api/admin/riders?status=approved').set(adminHeaders);
      expect(riders.body.data.find((r) => r.id === rider.id)).toMatchObject({ cashBalance: owed, cashOverdue: owed });
    });

    test('admins record settlements; short payments stay owed until paid or written off', async () => {
      const owed = await makeCashYesterday();
      const settle = (body) =>
        request(app).post(`/api/admin/riders/${rider.id}/settlements`).set(adminHeaders).send(body);

      expect((await settle({ kind: 'payment', amount: owed + 50 })).body.code).toBe('MORE_THAN_OWED');

      const partial = await settle({ kind: 'payment', amount: owed - 20, note: 'Handed over at office' });
      expect(partial.status).toBe(201);
      expect(partial.body.data).toMatchObject({ balance: 20, overdue: 20 });

      expect((await settle({ kind: 'write_off', amount: 20 })).body.code).toBe('NOTE_REQUIRED');
      const writeOff = await settle({ kind: 'write_off', amount: 20, note: 'Change given to the customer' });
      expect(writeOff.body.data).toMatchObject({ balance: 0, overdue: 0 });

      const next = (await place()).body.data;
      await restaurantDoes(next.id, 'confirm');
      expect((await riderDoes(next.id, 'claim')).status).toBe(200);

      const history = await request(app).get(`/api/admin/riders/${rider.id}/cash`).set(adminHeaders);
      expect(history.body.data.settlements.map((s) => s.kind)).toEqual(['write_off', 'payment']);
      expect(history.body.data.orders).toHaveLength(1);
    });

    test('cash collected today is not overdue yet', async () => {
      const order = await atTheDoor();
      await riderDoes(order.id, 'deliver', { collection: 'cash' });
      const next = (await place()).body.data;
      await restaurantDoes(next.id, 'confirm');
      expect((await riderDoes(next.id, 'claim')).status).toBe(200);
    });
  });

  describe('restaurant records payment for pickup and self-delivery', () => {
    test('pickup: recorded once the order is ready or collected', async () => {
      const order = (await place(customerHeaders, { deliveryType: 'pickup', deliveryAddress: undefined })).body.data;
      await restaurantDoes(order.id, 'confirm');

      const early = await restaurantDoes(order.id, 'record-payment', { collection: 'cash' });
      expect(early.status).toBe(400);

      await restaurantDoes(order.id, 'mark-preparing');
      await restaurantDoes(order.id, 'mark-ready');
      const recorded = await restaurantDoes(order.id, 'record-payment', { collection: 'upi' });
      expect(recorded.body.data).toMatchObject({ collectionStatus: 'collected', collectionMethod: 'upi', paymentStatus: 'completed' });

      const again = await restaurantDoes(order.id, 'record-payment', { collection: 'cash' });
      expect(again.body.code).toBe('ALREADY_RECORDED');
    });

    test('self-delivered: the restaurant records it; a rider’s order is the rider’s to record', async () => {
      const own = (await place()).body.data;
      for (const action of ['confirm', 'mark-preparing', 'mark-ready', 'mark-out-for-delivery', 'mark-delivered']) {
        await restaurantDoes(own.id, action);
      }
      const delivered = await request(app).get(`/api/orders/${own.id}`).set(ownerHeaders);
      expect(delivered.body.data).toMatchObject({ status: 'delivered', collectionStatus: 'awaiting' });
      const recorded = await restaurantDoes(own.id, 'record-payment', { collection: 'not_paid', note: 'Nobody home' });
      expect(recorded.body.data.collectionStatus).toBe('not_paid');

      const ridden = await atTheDoor(customer2Headers);
      const res = await restaurantDoes(ridden.id, 'record-payment', { collection: 'cash' });
      expect(res.body.code).toBe('RIDER_ASSIGNED');
    });
  });
});
