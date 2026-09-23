const request = require('supertest');
const { registerAndLogin, getAuthHeaders, cleanupAllData } = require('./helpers');

let app, sequelize, models, kitchen, businessTime;
let adminHeaders, customerHeaders, ownerHeaders, otherOwnerHeaders;
let mess, restaurant;

const DAY = 24 * 60 * 60 * 1000;

describe('Mess caterers', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    kitchen = require('../src/controllers/kitchenController');
    businessTime = require('../src/lib/businessTime');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'm-admin@test.com', 'system_admin')).tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'm-cust@test.com', 'customer')).tokens);
    const owner = await registerAndLogin(app, 'm-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    otherOwnerHeaders = getAuthHeaders((await registerAndLogin(app, 'm-other@test.com', 'restaurant_admin')).tokens);

    const create = async (body) => {
      const res = await request(app).post('/api/restaurants').set(ownerHeaders).send({ city: 'Chennai', address: '1 Mess Lane', ...body });
      expect(res.status).toBe(201);
      await request(app).put(`/api/restaurants/admin/${res.body.data.id}/approve`).set(adminHeaders);
      await request(app)
        .put(`/api/restaurants/${res.body.data.id}/delivery-settings`)
        .set(ownerHeaders)
        .send({ deliveryEnabled: true, pickupEnabled: true });
      return res.body.data;
    };
    mess = await create({ name: 'Amma Mess', email: 'amma@test.com', businessType: 'mess' });
    restaurant = await create({ name: 'Plain Restaurant', email: 'plain@test.com' });
  });

  afterEach(async () => {
    await models.Order.destroy({ where: {}, force: true });
    await models.DeliverySlot.destroy({ where: {}, force: true });
    await models.Menu.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const dateOffset = (days) => businessTime.businessDateString(new Date(Date.now() + days * DAY));

  const publishMenu = async (restaurantId, date, extra = {}) => {
    const created = await request(app).post('/api/menus').set(ownerHeaders).send({ restaurantId, date, ...extra });
    expect(created.status).toBe(201);
    const menuId = created.body.data.id;
    const withItems = await request(app)
      .post(`/api/menus/${menuId}/items`)
      .set(ownerHeaders)
      .send({ items: [{ name: 'Meals', price: 100 }, { name: 'Curd Rice', price: 50 }] });
    await request(app).post(`/api/menus/${menuId}/publish`).set(ownerHeaders);
    return { id: menuId, items: withItems.body.data.items };
  };

  const addSlot = async (menuId, startTime, endTime) =>
    (await request(app).post(`/api/menus/${menuId}/slots`).set(ownerHeaders).send({ startTime, endTime, maxOrders: 50 })).body.data;

  const order = (restaurantId, menu, overrides = {}) =>
    request(app)
      .post('/api/orders')
      .set(customerHeaders)
      .send({
        restaurantId,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType: 'delivery',
        deliveryAddress: '5 Hostel Road',
        paymentMethod: 'cod',
        ...overrides,
      });

  describe('business type and settings', () => {
    test('a mess starts with auto-accept on and auto-ready 15 minutes before slots', async () => {
      const mine = await request(app).get('/api/restaurants/my-restaurants').set(ownerHeaders);
      const created = mine.body.data.find((r) => r.id === mess.id);
      expect(created).toMatchObject({ businessType: 'mess', autoAcceptOrders: true, autoReadyMinutes: 15 });
      expect(mine.body.data.find((r) => r.id === restaurant.id)).toMatchObject({
        businessType: 'restaurant',
        autoAcceptOrders: false,
        autoReadyMinutes: null,
      });

      // Customers see the type but not the owner's settings
      const pub = await request(app).get(`/api/restaurants/${mess.id}`);
      expect(pub.body.data.businessType).toBe('mess');
      expect(pub.body.data.autoAcceptOrders).toBeUndefined();
    });

    test('owners change order handling; others cannot', async () => {
      const url = `/api/restaurants/${restaurant.id}/order-settings`;
      const res = await request(app).put(url).set(ownerHeaders).send({ autoAcceptOrders: true, autoReadyMinutes: 30 });
      expect(res.body.data).toMatchObject({ autoAcceptOrders: true, autoReadyMinutes: 30 });

      const off = await request(app).put(url).set(ownerHeaders).send({ autoAcceptOrders: false, autoReadyMinutes: null });
      expect(off.body.data).toMatchObject({ autoAcceptOrders: false, autoReadyMinutes: null });

      expect((await request(app).put(url).set(ownerHeaders).send({ autoReadyMinutes: 500 })).status).toBe(400);
      expect((await request(app).put(url).set(otherOwnerHeaders).send({ autoAcceptOrders: true })).status).toBe(403);
    });
  });

  describe('auto-accept', () => {
    test("a mess's cash orders are accepted straight away", async () => {
      const menu = await publishMenu(mess.id, dateOffset(1));
      const res = await order(mess.id, menu);
      expect(res.body.data.status).toBe('confirmed');
      expect(res.body.data.statusHistory.map((h) => [h.status, h.changedBy === 'system'])).toEqual([
        ['pending', false],
        ['confirmed', true],
      ]);
    });

    test('online orders still wait for payment, and restaurants without auto-accept wait for a tap', async () => {
      const menu = await publishMenu(mess.id, dateOffset(1));
      expect((await order(mess.id, menu, { paymentMethod: 'online' })).body.data.status).toBe('pending');

      const plainMenu = await publishMenu(restaurant.id, dateOffset(1));
      expect((await order(restaurant.id, plainMenu)).body.data.status).toBe('pending');
    });
  });

  describe('order cutoff', () => {
    test('orders close at the ordering end time on the menu day', async () => {
      const closed = await publishMenu(restaurant.id, dateOffset(0), { orderingStartTime: '00:00', orderingEndTime: '00:00' });
      const res = await order(restaurant.id, closed);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'ORDERING_CLOSED', message: 'Orders for this menu closed at 00:00' });
    });

    test('menus for past days are closed; tomorrow can be ordered today', async () => {
      const past = await publishMenu(restaurant.id, dateOffset(-1));
      expect((await order(restaurant.id, past)).body.code).toBe('ORDERING_CLOSED');

      const tomorrow = await publishMenu(restaurant.id, dateOffset(1), { orderingStartTime: '07:00', orderingEndTime: '10:00' });
      expect((await order(restaurant.id, tomorrow)).status).toBe(201);
    });
  });

  describe('kitchen view and bulk actions', () => {
    const setUpDay = async () => {
      await request(app).put(`/api/restaurants/${restaurant.id}/order-settings`).set(ownerHeaders).send({ autoAcceptOrders: false });
      const date = dateOffset(1);
      const menu = await publishMenu(restaurant.id, date);
      const lunch = await addSlot(menu.id, '12:30', '13:00');
      const dinner = await addSlot(menu.id, '19:30', '20:00');
      const place = async (overrides) => (await order(restaurant.id, menu, overrides)).body.data;
      const orders = {
        lunch1: await place({ deliverySlotId: lunch.id, items: [{ menuItemId: menu.items[0].id, quantity: 2 }] }),
        lunch2: await place({ deliverySlotId: lunch.id, items: [{ menuItemId: menu.items[1].id, quantity: 1 }] }),
        dinner: await place({ deliverySlotId: dinner.id }),
        pickup: await place({ deliveryType: 'pickup', deliveryAddress: undefined }),
      };
      return { date, menu, lunch, dinner, orders };
    };

    test('shows dish totals and orders grouped by slot, then pickup', async () => {
      const { date, lunch, dinner } = await setUpDay();
      const res = await request(app).get(`/api/orders/kitchen?restaurantId=${restaurant.id}&date=${date}`).set(ownerHeaders);
      expect(res.status).toBe(200);
      const { totals, groups, counts } = res.body.data;
      expect(totals).toEqual([
        expect.objectContaining({ name: 'Meals', quantity: 4 }),
        expect.objectContaining({ name: 'Curd Rice', quantity: 1 }),
      ]);
      expect(counts).toEqual({ pending: 4 });
      expect(groups.map((g) => [g.kind, g.key, g.orders.length])).toEqual([
        ['slot', lunch.id, 2],
        ['slot', dinner.id, 1],
        ['pickup', 'pickup', 1],
      ]);
      expect(groups[0].dishTotals).toEqual([
        expect.objectContaining({ name: 'Meals', quantity: 2 }),
        expect.objectContaining({ name: 'Curd Rice', quantity: 1 }),
      ]);

      const other = await request(app).get(`/api/orders/kitchen?restaurantId=${restaurant.id}&date=${date}`).set(otherOwnerHeaders);
      expect(other.status).toBe(403);
    });

    test('accept all, then mark all ready, one slot at a time', async () => {
      const { menu, lunch, orders } = await setUpDay();
      const bulk = (group, action) => request(app).post('/api/orders/bulk').set(ownerHeaders).send({ menuId: menu.id, group, action });

      expect((await bulk(lunch.id, 'accept')).body.data).toEqual({ updated: 2, skipped: 0 });
      expect((await bulk(lunch.id, 'ready')).body.data).toEqual({ updated: 2, skipped: 0 });

      const status = async (o) => (await models.Order.findByPk(o.id)).status;
      expect(await status(orders.lunch1)).toBe('ready');
      expect(await status(orders.lunch2)).toBe('ready');
      expect(await status(orders.dinner)).toBe('pending');
      expect(await status(orders.pickup)).toBe('pending');

      // Ready only moves accepted orders
      expect((await bulk('pickup', 'ready')).body.data).toEqual({ updated: 0, skipped: 0 });
      await bulk('pickup', 'accept');
      expect((await bulk('pickup', 'ready')).body.data.updated).toBe(1);

      const saved = await models.Order.findByPk(orders.lunch1.id);
      expect(saved.statusHistory.map((h) => h.status)).toEqual(['pending', 'confirmed', 'ready']);

      const other = await request(app).post('/api/orders/bulk').set(otherOwnerHeaders).send({ menuId: menu.id, group: 'pickup', action: 'accept' });
      expect(other.status).toBe(403);
    });
  });

  describe('scheduled auto-ready', () => {
    test("marks a slot's accepted orders ready the set minutes before it starts", async () => {
      const date = dateOffset(1);
      const menu = await publishMenu(mess.id, date);
      const noon = await addSlot(menu.id, '12:00', '12:30');
      const two = await addSlot(menu.id, '14:00', '14:30');
      const early = (await order(mess.id, menu, { deliverySlotId: noon.id })).body.data;
      const late = (await order(mess.id, menu, { deliverySlotId: two.id })).body.data;
      const pickup = (await order(mess.id, menu, { deliveryType: 'pickup', deliveryAddress: undefined })).body.data;

      // 11:50 on the menu day: the 12:00 slot is within the mess's 15 minutes; 14:00 isn't
      const marked = await kitchen.runAutoReady(businessTime.businessDateTime(date, '11:50'));
      expect(marked).toBe(1);

      const status = async (o) => (await models.Order.findByPk(o.id)).status;
      expect(await status(early)).toBe('ready');
      expect(await status(late)).toBe('confirmed');
      expect(await status(pickup)).toBe('confirmed');

      const saved = await models.Order.findByPk(early.id);
      expect(saved.statusHistory.at(-1)).toMatchObject({ status: 'ready', changedBy: 'system' });

      // Restaurants without auto-ready are left alone
      await request(app).put(`/api/restaurants/${mess.id}/order-settings`).set(ownerHeaders).send({ autoReadyMinutes: null });
      expect(await kitchen.runAutoReady(businessTime.businessDateTime(date, '13:59'))).toBe(0);
      expect(await status(late)).toBe('confirmed');
      await request(app).put(`/api/restaurants/${mess.id}/order-settings`).set(ownerHeaders).send({ autoReadyMinutes: 15 });
    });
  });
});
