const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  createMenu,
  publishMenu,
  updateDeliverySettings,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;
let customerHeaders, ownerHeaders, otherOwnerHeaders;
let restaurant, menu;

// Endpoints the restaurant admin app relies on: slot management, menu listing
// and the full delivery status flow.
describe('Restaurant admin API', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');

    await sequelize.sync({ force: true });

    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'ra-customer@test.com', 'customer')).tokens);
    const adminHeaders = getAuthHeaders((await registerAndLogin(app, 'ra-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'ra-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    otherOwnerHeaders = getAuthHeaders(
      (await registerAndLogin(app, 'ra-other@test.com', 'restaurant_admin')).tokens
    );

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders);
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, {
      deliveryEnabled: true,
      pickupEnabled: true,
    });

    menu = await createMenu(app, restaurant.id, ownerHeaders);
    menu = await publishMenu(app, menu.id, ownerHeaders);
  });

  afterEach(async () => {
    await models.Order.destroy({ where: {}, force: true });
    await models.DeliverySlot.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const addSlot = (headers, body = {}) =>
    request(app)
      .post(`/api/menus/${menu.id}/slots`)
      .set(headers)
      .send({ startTime: '12:00', endTime: '12:30', maxOrders: 5, ...body });

  const placeOrder = async (deliveryType, extra = {}) => {
    const response = await request(app)
      .post('/api/orders')
      .set(customerHeaders)
      .send({
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType,
        ...(deliveryType === 'delivery' ? { deliveryAddress: '1 Test Road' } : {}),
        paymentMethod: 'cod',
        ...extra,
      });
    expect(response.status).toBe(201);
    return response.body.data;
  };

  const advance = (orderId, action, headers = ownerHeaders) =>
    request(app).post(`/api/orders/${orderId}/${action}`).set(headers);

  describe('delivery slots', () => {
    test('owner can create a slot without repeating the restaurant id', async () => {
      const response = await addSlot(ownerHeaders);
      expect(response.status).toBe(201);
      expect(response.body.data.restaurantId).toBe(restaurant.id);
    });

    test("another restaurant admin cannot add slots to this restaurant's menu", async () => {
      const response = await addSlot(otherOwnerHeaders, { restaurantId: restaurant.id });
      expect(response.status).toBe(403);
      expect(await models.DeliverySlot.count()).toBe(0);
    });

    test('another restaurant admin cannot update or delete slots', async () => {
      const slot = (await addSlot(ownerHeaders)).body.data;

      const update = await request(app)
        .put(`/api/menus/slots/${slot.id}`)
        .set(otherOwnerHeaders)
        .send({ maxOrders: 1 });
      expect(update.status).toBe(403);

      const remove = await request(app).delete(`/api/menus/slots/${slot.id}`).set(otherOwnerHeaders);
      expect(remove.status).toBe(403);

      const saved = await models.DeliverySlot.findByPk(slot.id);
      expect(saved.maxOrders).toBe(5);
    });

    test('owner can update and delete their slots', async () => {
      const slot = (await addSlot(ownerHeaders)).body.data;

      const update = await request(app)
        .put(`/api/menus/slots/${slot.id}`)
        .set(ownerHeaders)
        .send({ maxOrders: 8, endTime: '12:45' });
      expect(update.status).toBe(200);
      expect(update.body.data.maxOrders).toBe(8);

      const remove = await request(app).delete(`/api/menus/slots/${slot.id}`).set(ownerHeaders);
      expect(remove.status).toBe(200);
      expect(await models.DeliverySlot.count()).toBe(0);
    });

    test('capacity cannot drop below orders already booked in the slot', async () => {
      const slot = (await addSlot(ownerHeaders, { maxOrders: 3 })).body.data;
      await placeOrder('delivery', { deliverySlotId: slot.id });
      await placeOrder('delivery', { deliverySlotId: slot.id });

      const response = await request(app)
        .put(`/api/menus/slots/${slot.id}`)
        .set(ownerHeaders)
        .send({ maxOrders: 1 });

      expect(response.status).toBe(400);
      expect((await models.DeliverySlot.findByPk(slot.id)).maxOrders).toBe(3);
    });
  });

  describe('menus', () => {
    test('accepts an ordering window when creating and updating a menu', async () => {
      const created = await request(app)
        .post('/api/menus')
        .set(ownerHeaders)
        .send({ restaurantId: restaurant.id, date: '2030-01-15', orderingStartTime: '08:00', orderingEndTime: '11:30' });
      expect(created.status).toBe(201);

      const updated = await request(app)
        .put(`/api/menus/${created.body.data.id}`)
        .set(ownerHeaders)
        .send({ orderingEndTime: '10:45' });
      expect(updated.status).toBe(200);
      expect(updated.body.data.orderingEndTime).toMatch(/^10:45/);

      const invalid = await request(app)
        .put(`/api/menus/${created.body.data.id}`)
        .set(ownerHeaders)
        .send({ orderingEndTime: '25:00' });
      expect(invalid.status).toBe(400);
    });
  });

  describe('GET /api/menus', () => {
    test('works without a restaurant filter', async () => {
      const response = await request(app).get('/api/menus');
      expect(response.status).toBe(200);
      expect(response.body.data.map((m) => m.id)).toContain(menu.id);
    });
  });

  describe('delivery status flow', () => {
    test('owner moves a delivery order through out_for_delivery to delivered', async () => {
      const order = await placeOrder('delivery');

      for (const [action, status] of [
        ['confirm', 'confirmed'],
        ['mark-preparing', 'preparing'],
        ['mark-ready', 'ready'],
        ['mark-out-for-delivery', 'out_for_delivery'],
        ['mark-delivered', 'delivered'],
      ]) {
        const response = await advance(order.id, action);
        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe(status);
      }

      const saved = await models.Order.findByPk(order.id);
      expect(saved.statusHistory.map((h) => h.status)).toEqual([
        'pending',
        'confirmed',
        'preparing',
        'ready',
        'out_for_delivery',
        'delivered',
      ]);
    });

    test('out for delivery only applies to ready delivery orders', async () => {
      const pending = await placeOrder('delivery');
      expect((await advance(pending.id, 'mark-out-for-delivery')).status).toBe(400);

      const pickup = await placeOrder('pickup');
      for (const action of ['confirm', 'mark-preparing', 'mark-ready']) {
        await advance(pickup.id, action);
      }
      const response = await advance(pickup.id, 'mark-out-for-delivery');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DELIVERY_TYPE');
    });

    test('another restaurant admin cannot mark an order out for delivery', async () => {
      const order = await placeOrder('delivery');
      for (const action of ['confirm', 'mark-preparing', 'mark-ready']) {
        await advance(order.id, action);
      }

      expect((await advance(order.id, 'mark-out-for-delivery', otherOwnerHeaders)).status).toBe(403);
      expect((await models.Order.findByPk(order.id)).status).toBe('ready');
    });
  });
});
