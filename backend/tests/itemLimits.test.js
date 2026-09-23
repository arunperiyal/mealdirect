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
let ownerHeaders, customerHeaders, otherCustomerHeaders;
let restaurant, menu;

const byName = (name) => menu.items.find((i) => i.name === name);

// Per-dish limits a restaurant sets, and the basic quantity check on every order line
describe('Dish quantity limits', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    const adminHeaders = getAuthHeaders((await registerAndLogin(app, 'lim-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'lim-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'lim-cust@test.com', 'customer')).tokens);
    otherCustomerHeaders = getAuthHeaders((await registerAndLogin(app, 'lim-cust2@test.com', 'customer')).tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders);
    await approveRestaurant(app, restaurant.id, adminHeaders);
    await request(app)
      .put(`/api/restaurants/${restaurant.id}/delivery-settings`)
      .set(ownerHeaders)
      .send({ pickupEnabled: true });

    menu = await createMenu(app, restaurant.id, ownerHeaders, {
      items: [
        { name: 'Biryani', price: 200, maxPerOrder: 2, maxPerDay: 3 },
        { name: 'Sweet', price: 40, maxPerOrder: 5 },
        { name: 'Meals', price: 100 },
      ],
    });
    menu = await publishMenu(app, menu.id, ownerHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const order = (items, headers = customerHeaders) =>
    request(app)
      .post('/api/orders')
      .set(headers)
      .send({ restaurantId: restaurant.id, menuId: menu.id, items, deliveryType: 'pickup', paymentMethod: 'cod' });
  const line = (name, quantity) => ({ menuItemId: byName(name).id, quantity });

  test('limits are saved with the dish and shown to customers', async () => {
    const pub = (await request(app).get(`/api/menus/${menu.id}`)).body.data;
    expect(pub.items.find((i) => i.name === 'Biryani')).toMatchObject({ maxPerOrder: 2, maxPerDay: 3 });
    expect(pub.items.find((i) => i.name === 'Meals')).toMatchObject({ maxPerOrder: null, maxPerDay: null });
  });

  test('every line needs a whole quantity from 1 to 20', async () => {
    for (const quantity of [0, -1, 1.5, 21, '2x']) {
      const res = await order([line('Meals', quantity)]);
      expect(res.status).toBe(400);
    }
    // Two lines for the same dish count together
    const split = await order([line('Meals', 15), line('Meals', 10)]);
    expect(split.status).toBe(409);
    expect(split.body.code).toBe('ITEM_LIMIT_PER_ORDER');
  });

  test('a dish can be limited per order', async () => {
    const res = await order([line('Sweet', 6)]);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ITEM_LIMIT_PER_ORDER', message: 'You can order up to 5 × Sweet per order' });
    expect((await order([line('Sweet', 5)])).status).toBe(201);
  });

  test('a dish can be limited per customer per day, across orders; cancelled orders do not count', async () => {
    const first = await order([line('Biryani', 2)]);
    expect(first.status).toBe(201);

    const tooMany = await order([line('Biryani', 2)]);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body).toMatchObject({
      code: 'ITEM_LIMIT_PER_DAY',
      message: 'Biryani is limited to 3 per customer a day. You can add 1 more.',
    });
    expect((await order([line('Biryani', 1)])).status).toBe(201);

    const reached = await order([line('Biryani', 1)]);
    expect(reached.body.message).toMatch(/You've already ordered that many/);

    // Another customer has their own allowance
    expect((await order([line('Biryani', 2)], otherCustomerHeaders)).status).toBe(201);

    // Cancelling frees the allowance
    await request(app).post(`/api/orders/${first.body.data.id}/cancel`).set(customerHeaders).send({ reason: 'Changed plans' });
    expect((await order([line('Biryani', 2)])).status).toBe(201);
  });

  test('owners change limits; null removes one; per order cannot exceed per day', async () => {
    const set = (changes) =>
      request(app).put(`/api/menus/${menu.id}/items/${byName('Meals').id}`).set(ownerHeaders).send(changes);

    const bad = await set({ maxPerOrder: 5, maxPerDay: 2 });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_LIMITS');
    expect((await set({ maxPerOrder: 25 })).status).toBe(400);

    const ok = await set({ maxPerOrder: 4 });
    expect(ok.body.data.items.find((i) => i.name === 'Meals').maxPerOrder).toBe(4);
    // A lower daily limit than the saved per-order one is refused too
    expect((await set({ maxPerDay: 3 })).body.code).toBe('INVALID_LIMITS');

    const cleared = await set({ maxPerOrder: null });
    expect(cleared.body.data.items.find((i) => i.name === 'Meals').maxPerOrder).toBeNull();

    const addBad = await request(app)
      .post(`/api/menus/${menu.id}/items`)
      .set(ownerHeaders)
      .send({ items: [{ name: 'Dosa', price: 50, maxPerOrder: 3, maxPerDay: 1 }] });
    expect(addBad.body.code).toBe('INVALID_LIMITS');
  });
});
