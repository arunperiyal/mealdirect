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
let ownerHeaders, customerHeaders;
let restaurant, menu, otherMenu;

// Delivery time capacity bookkeeping. The in-memory SQLite used here has one connection
// and can't run transactions side by side, so orders go one at a time; the Postgres
// contract test (mobile/restaurant/src/__contract__) sends truly concurrent orders.
describe('Delivery time capacity', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    const adminHeaders = getAuthHeaders((await registerAndLogin(app, 'race-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'race-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'race-cust@test.com', 'customer')).tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders);
    await approveRestaurant(app, restaurant.id, adminHeaders);
    await request(app)
      .put(`/api/restaurants/${restaurant.id}/delivery-settings`)
      .set(ownerHeaders)
      .send({ deliveryEnabled: true, pickupEnabled: true });

    menu = await publishMenu(
      app,
      (await createMenu(app, restaurant.id, ownerHeaders, { items: [{ name: 'Meals', price: 100 }, { name: 'Payasam', price: 40 }] })).id,
      ownerHeaders
    );
    otherMenu = await publishMenu(app, (await createMenu(app, restaurant.id, ownerHeaders)).id, ownerHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const addSlot = async (menuId, maxOrders) =>
    (await request(app).post(`/api/menus/${menuId}/slots`).set(ownerHeaders).send({ startTime: '12:00', endTime: '12:30', maxOrders }))
      .body.data;
  const order = (body) =>
    request(app)
      .post('/api/orders')
      .set(customerHeaders)
      .send({
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType: 'delivery',
        deliveryAddress: '1 Test Road',
        paymentMethod: 'cod',
        ...body,
      });
  const slotCount = async (id) => (await models.DeliverySlot.findByPk(id)).currentOrders;

  test('a delivery time fills exactly to its limit, counting each order once', async () => {
    const slot = await addSlot(menu.id, 2);
    expect((await order({ deliverySlotId: slot.id })).status).toBe(201);
    expect((await order({ deliverySlotId: slot.id })).status).toBe(201);
    const full = await order({ deliverySlotId: slot.id });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('SLOT_FULL');
    expect(await slotCount(slot.id)).toBe(2);
  });

  test("a delivery time from another menu can't be used", async () => {
    const foreign = await addSlot(otherMenu.id, 5);
    const res = await order({ deliverySlotId: foreign.id });
    expect(res.status).toBe(404);
    expect(await slotCount(foreign.id)).toBe(0);
  });

  test('pickup orders never take a delivery place', async () => {
    const slot = await addSlot(menu.id, 5);
    const res = await order({ deliveryType: 'pickup', deliverySlotId: slot.id });
    expect(res.status).toBe(201);
    expect(res.body.data.deliverySlotId).toBeNull();
    expect(await slotCount(slot.id)).toBe(0);
  });

  test('cancelling gives the place back once; a second cancel is refused', async () => {
    const slot = await addSlot(menu.id, 5);
    const placed = (await order({ deliverySlotId: slot.id })).body.data;
    await order({ deliverySlotId: slot.id });
    expect(await slotCount(slot.id)).toBe(2);

    const cancel = () => request(app).post(`/api/orders/${placed.id}/cancel`).set(ownerHeaders).send({ reason: 'Sold out' });
    expect((await cancel()).status).toBe(200);
    const again = await cancel();
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_CANCELLED');
    expect(await slotCount(slot.id)).toBe(1);
  });

  test('a customer cancelling twice is told it is already cancelled', async () => {
    const placed = (await order({ deliveryType: 'pickup' })).body.data;
    const cancel = () => request(app).post(`/api/orders/${placed.id}/cancel`).set(customerHeaders).send({});
    expect((await cancel()).status).toBe(200);
    const again = await cancel();
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_CANCELLED');
  });

  test("a delivery time with orders can't shrink below them or be deleted", async () => {
    const slot = await addSlot(menu.id, 3);
    await order({ deliverySlotId: slot.id });
    await order({ deliverySlotId: slot.id });
    const shrink = await request(app).put(`/api/menus/slots/${slot.id}`).set(ownerHeaders).send({ maxOrders: 1 });
    expect(shrink.status).toBe(400);
    const del = await request(app).delete(`/api/menus/slots/${slot.id}`).set(ownerHeaders);
    expect(del.status).toBe(409);
    expect((await request(app).put(`/api/menus/slots/${slot.id}`).set(ownerHeaders).send({ maxOrders: 2 })).status).toBe(200);
  });
});
