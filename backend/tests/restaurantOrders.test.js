const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  createMenu,
  publishMenu,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;
let customerHeaders, adminHeaders;
let ownerHeaders, otherOwnerHeaders;
let restaurant, otherRestaurant, menu;

// Restaurant admins act on orders for restaurants they own (Restaurant.ownerId),
// not on orders whose restaurantId happens to equal their user id.
describe('Restaurant admin order access', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');

    await sequelize.sync({ force: true });

    const cust = await registerAndLogin(app, 'ro-customer@test.com', 'customer');
    customerHeaders = getAuthHeaders(cust.tokens);

    const admin = await registerAndLogin(app, 'ro-admin@test.com', 'system_admin');
    adminHeaders = getAuthHeaders(admin.tokens);

    const owner = await registerAndLogin(app, 'ro-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);

    const otherOwner = await registerAndLogin(app, 'ro-other@test.com', 'restaurant_admin');
    otherOwnerHeaders = getAuthHeaders(otherOwner.tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders);
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

    otherRestaurant = await createRestaurant(app, otherOwner.user.id, otherOwnerHeaders, {
      name: 'Other Kitchen',
      email: 'other-kitchen@test.com',
    });
    otherRestaurant = await approveRestaurant(app, otherRestaurant.id, adminHeaders);

    menu = await createMenu(app, restaurant.id, ownerHeaders);
    menu = await publishMenu(app, menu.id, ownerHeaders);
  });

  afterEach(async () => {
    await models.Payment.destroy({ where: {}, force: true });
    await models.Order.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const placeOrder = async (paymentMethod = 'cod') => {
    const response = await request(app)
      .post('/api/orders')
      .set(customerHeaders)
      .send({
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType: 'pickup',
        paymentMethod,
      });
    expect(response.status).toBe(201);
    return response.body.data;
  };

  describe('GET /api/orders/restaurant-orders', () => {
    test("lists orders for the owner's restaurants", async () => {
      const order = await placeOrder();

      const response = await request(app).get('/api/orders/restaurant-orders').set(ownerHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data.map((o) => o.id)).toEqual([order.id]);
      expect(response.body.meta.total).toBe(1);
    });

    test("does not show another restaurant's orders", async () => {
      await placeOrder();

      const response = await request(app).get('/api/orders/restaurant-orders').set(otherOwnerHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    test('filters by one owned restaurant and rejects restaurants the admin does not own', async () => {
      const order = await placeOrder();

      const own = await request(app)
        .get(`/api/orders/restaurant-orders?restaurantId=${restaurant.id}`)
        .set(ownerHeaders);
      expect(own.status).toBe(200);
      expect(own.body.data.map((o) => o.id)).toEqual([order.id]);

      const notOwned = await request(app)
        .get(`/api/orders/restaurant-orders?restaurantId=${restaurant.id}`)
        .set(otherOwnerHeaders);
      expect(notOwned.status).toBe(403);
    });

    test('is restricted to restaurant admins', async () => {
      const response = await request(app).get('/api/orders/restaurant-orders').set(customerHeaders);
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/orders/admin/orders', () => {
    test('lets system admins list all orders', async () => {
      const order = await placeOrder();

      const response = await request(app).get('/api/orders/admin/orders').set(adminHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data.map((o) => o.id)).toEqual([order.id]);
    });
  });

  describe('GET /api/orders/:id', () => {
    test('owner can view the order; another restaurant admin cannot', async () => {
      const order = await placeOrder();

      const own = await request(app).get(`/api/orders/${order.id}`).set(ownerHeaders);
      expect(own.status).toBe(200);

      const other = await request(app).get(`/api/orders/${order.id}`).set(otherOwnerHeaders);
      expect(other.status).toBe(403);
    });
  });

  describe('status updates', () => {
    test('owner can move an order through confirm → preparing → ready', async () => {
      const order = await placeOrder();

      for (const [action, status] of [
        ['confirm', 'confirmed'],
        ['mark-preparing', 'preparing'],
        ['mark-ready', 'ready'],
      ]) {
        const response = await request(app).post(`/api/orders/${order.id}/${action}`).set(ownerHeaders);
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe(status);
      }

      const saved = await models.Order.findByPk(order.id);
      expect(saved.statusHistory.map((h) => h.status)).toEqual([
        'pending',
        'confirmed',
        'preparing',
        'ready',
      ]);
    });

    test("another restaurant admin cannot update the order", async () => {
      const order = await placeOrder();

      for (const action of ['confirm', 'mark-preparing', 'mark-ready', 'mark-delivered']) {
        const response = await request(app)
          .post(`/api/orders/${order.id}/${action}`)
          .set(otherOwnerHeaders);
        expect(response.status).toBe(403);
      }
      expect((await models.Order.findByPk(order.id)).status).toBe('pending');
    });

    test('owner still cannot confirm an unpaid online order', async () => {
      const order = await placeOrder('online');

      const response = await request(app).post(`/api/orders/${order.id}/confirm`).set(ownerHeaders);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PAYMENT_PENDING');
    });
  });

  describe('POST /api/orders/:id/cancel', () => {
    test('owner can cancel; another restaurant admin cannot', async () => {
      const order = await placeOrder();

      const other = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(otherOwnerHeaders)
        .send({ reason: 'Not mine' });
      expect(other.status).toBe(403);

      const own = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(ownerHeaders)
        .send({ reason: 'Out of stock' });
      expect(own.status).toBe(200);
      expect(own.body.data.status).toBe('cancelled');
    });
  });

  describe('GET /api/payments/status/:orderId', () => {
    test("owner can see payment status for their restaurant's order", async () => {
      const order = await placeOrder('online');

      const own = await request(app).get(`/api/payments/status/${order.id}`).set(ownerHeaders);
      expect(own.status).toBe(200);

      const other = await request(app).get(`/api/payments/status/${order.id}`).set(otherOwnerHeaders);
      expect(other.status).toBe(403);
    });
  });
});
