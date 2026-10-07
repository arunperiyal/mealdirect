process.env.ONLINE_PAYMENTS_ENABLED = 'false';

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

let app, sequelize, models, runAutoAssign;
let adminHeaders, ownerHeaders, customerHeaders, restaurant, menu, lunch, dinner;
const riders = {};

// Riders' standing orders: a restaurant's deliveries due between two times
describe('Rider auto-accept', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    ({ runAutoAssign } = require('../src/controllers/autoAcceptController'));
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'aa-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'aa-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'aa-cust@test.com', 'customer')).tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Annapurna Mess' });
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, { deliveryEnabled: true, pickupEnabled: true });
    menu = await publishMenu(app, (await createMenu(app, restaurant.id, ownerHeaders)).id, ownerHeaders);
    const slot = async (startTime, endTime) =>
      (await request(app).post(`/api/menus/${menu.id}/slots`).set(ownerHeaders).send({ startTime, endTime, maxOrders: 50 }))
        .body.data;
    lunch = await slot('12:30', '13:00');
    dinner = await slot('19:30', '20:00');

    for (const [name, phone, approve] of [['asha', '9876500101', true], ['bala', '9876500102', true], ['new', '9876500103', false]]) {
      const signup = await request(app).post('/api/auth/register').send({
        email: `aa-${name}@test.com`,
        password: 'TestPass123!',
        firstName: name,
        phone,
        role: 'delivery_partner',
      });
      riders[name] = { id: signup.body.data.user.id, headers: getAuthHeaders({ accessToken: signup.body.data.accessToken }) };
      if (approve) await request(app).put(`/api/admin/riders/${riders[name].id}/approve`).set(adminHeaders);
    }
  });

  afterEach(async () => {
    await models.Order.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await models.AutoAcceptRule.destroy({ where: {} });
    await cleanupAllData(models);
    await sequelize.close();
  });

  const place = async (slotId) =>
    (
      await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: restaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
          deliveryType: 'delivery',
          deliverySlotId: slotId,
          deliveryAddress: '3 Rule Road',
          paymentMethod: 'cod',
        })
    ).body.data;
  const confirm = (id) => request(app).post(`/api/orders/${id}/confirm`).set(ownerHeaders);
  const addRule = (rider, body) =>
    request(app).post('/api/delivery/rules').set(riders[rider].headers).send({ restaurantId: restaurant.id, ...body });
  const riderOf = async (id) => (await models.Order.findByPk(id)).riderId;

  test('takes orders due in the window as soon as the restaurant accepts them', async () => {
    const rule = await addRule('asha', { startTime: '12:00', endTime: '14:00' });
    expect(rule.status).toBe(200);
    expect(rule.body.data).toMatchObject({ startTime: '12:00', endTime: '14:00', enabled: true, restaurant: { name: 'Annapurna Mess' } });

    const atLunch = await place(lunch.id);
    const atDinner = await place(dinner.id);
    const confirmed = await confirm(atLunch.id);
    expect(confirmed.body.data.riderId).toBe(riders.asha.id);
    await confirm(atDinner.id);
    expect(await riderOf(atDinner.id)).toBeNull();

    // It's theirs, as if they had claimed it
    const mine = await request(app).get('/api/delivery/orders').set(riders.asha.headers);
    expect(mine.body.data.map((o) => o.id)).toEqual([atLunch.id]);
  });

  test('a new rule takes orders already waiting; the rider with fewer deliveries goes first', async () => {
    const first = await place(lunch.id);
    await confirm(first.id);
    expect(await riderOf(first.id)).toBe(riders.asha.id);

    // Waiting in the queue before Bala's rule exists
    const waiting = await place(dinner.id);
    await confirm(waiting.id);
    await addRule('bala', { startTime: '19:00', endTime: '21:00' });
    expect(await riderOf(waiting.id)).toBe(riders.bala.id);

    await addRule('bala', { startTime: '12:00', endTime: '14:00' });
    // Asha 1, Bala 1: a tie goes to the older rule (Asha's); then Bala has fewer
    const second = await place(lunch.id);
    await confirm(second.id);
    expect(await riderOf(second.id)).toBe(riders.asha.id);
    const third = await place(lunch.id);
    await confirm(third.id);
    expect(await riderOf(third.id)).toBe(riders.bala.id);
  });

  test("an order given back doesn't return to the same rider; paused rules take nothing", async () => {
    const order = await place(lunch.id);
    await confirm(order.id);
    const taker = (await riderOf(order.id)) === riders.asha.id ? 'asha' : 'bala';
    const other = taker === 'asha' ? 'bala' : 'asha';
    await request(app).post(`/api/delivery/orders/${order.id}/release`).set(riders[taker].headers);

    // Pause the other rider's lunch rule: nobody takes it
    const rules = (await request(app).get('/api/delivery/rules').set(riders[other].headers)).body.data;
    const lunchRule = rules.find((r) => r.startTime === '12:00');
    const paused = await request(app).put(`/api/delivery/rules/${lunchRule.id}`).set(riders[other].headers).send({ enabled: false });
    expect(paused.body.data.enabled).toBe(false);
    await runAutoAssign();
    expect(await riderOf(order.id)).toBeNull();

    // Back on: the other rider gets it, never the one who gave it back
    await request(app).put(`/api/delivery/rules/${lunchRule.id}`).set(riders[other].headers).send({ enabled: true });
    expect(await riderOf(order.id)).toBe(riders[other].id);
  });

  test('riders still keep to the limit of active deliveries', async () => {
    const orders = [];
    for (let i = 0; i < 7; i++) orders.push(await place(lunch.id));
    // Accepting the whole lunch group at once
    const bulk = await request(app)
      .post('/api/orders/bulk')
      .set(ownerHeaders)
      .send({ menuId: menu.id, group: lunch.id, action: 'accept' });
    expect(bulk.body.data.updated).toBe(7);

    const owners = await Promise.all(orders.map((o) => riderOf(o.id)));
    expect(owners.filter((r) => r === riders.asha.id)).toHaveLength(3);
    expect(owners.filter((r) => r === riders.bala.id)).toHaveLength(3);
    expect(owners.filter((r) => r === null)).toHaveLength(1);
  });

  test('checks the rule, whose it is, and that the rider is approved', async () => {
    expect((await addRule('asha', { startTime: '14:00', endTime: '12:00' })).body.code).toBe('INVALID_WINDOW');
    expect((await addRule('asha', { startTime: '2pm', endTime: '15:00' })).status).toBe(400);
    expect((await addRule('new', { startTime: '12:00', endTime: '14:00' })).status).toBe(403);

    const ashaRule = (await request(app).get('/api/delivery/rules').set(riders.asha.headers)).body.data[0];
    expect((await request(app).delete(`/api/delivery/rules/${ashaRule.id}`).set(riders.bala.headers)).status).toBe(404);
    expect((await request(app).delete(`/api/delivery/rules/${ashaRule.id}`).set(riders.asha.headers)).status).toBe(200);
  });
});
