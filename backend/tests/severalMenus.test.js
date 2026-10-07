process.env.ONLINE_PAYMENTS_ENABLED = 'false';

const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  updateDeliverySettings,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models, businessTime;
let ownerHeaders, customerHeaders, restaurant;

// A restaurant can run several named menus on one day: lunch and dinner, or two lunches
describe('Several menus a day', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    businessTime = require('../src/lib/businessTime');
    await sequelize.sync({ force: true });

    const adminHeaders = getAuthHeaders((await registerAndLogin(app, 'sm-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'sm-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'sm-cust@test.com', 'customer')).tokens);
    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Two Meals Mess' });
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, { deliveryEnabled: true, pickupEnabled: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const today = () => businessTime.businessDateString();
  const menuWith = async (body, dish) => {
    const created = await request(app).post('/api/menus').set(ownerHeaders).send({ restaurantId: restaurant.id, date: today(), ...body });
    const id = created.body.data.id;
    const items = (await request(app).post(`/api/menus/${id}/items`).set(ownerHeaders).send({ items: [{ name: dish, price: 80 }] })).body.data.items;
    await request(app).post(`/api/menus/${id}/publish`).set(ownerHeaders);
    return { ...created.body.data, items };
  };
  const order = (menu) =>
    request(app)
      .post('/api/orders')
      .set(customerHeaders)
      .send({
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType: 'pickup',
        paymentMethod: 'cod',
      });

  test('named menus on the same day, each ordered on its own; orders say which menu', async () => {
    const lunch = await menuWith({ name: '  Lunch ' }, 'Meals');
    const dinner = await menuWith({ name: 'Dinner' }, 'Chapati');
    expect([lunch.name, dinner.name]).toEqual(['Lunch', 'Dinner']);

    const listed = await request(app).get('/api/menus').query({ restaurantId: restaurant.id, date: today() });
    expect(listed.body.data.map((m) => m.name)).toEqual(['Lunch', 'Dinner']);

    const atLunch = (await order(lunch)).body.data;
    expect((await order(dinner)).status).toBe(201);

    const detail = await request(app).get(`/api/orders/${atLunch.id}`).set(customerHeaders);
    expect(detail.body.data.menu).toMatchObject({ id: lunch.id, name: 'Lunch' });
    const mine = await request(app).get('/api/orders').set(customerHeaders);
    expect(mine.body.data.map((o) => o.menu.name).sort()).toEqual(['Dinner', 'Lunch']);

    const kitchen = await request(app).get('/api/orders/kitchen').query({ restaurantId: restaurant.id, date: today() }).set(ownerHeaders);
    expect(kitchen.body.data.menus.map((m) => m.name)).toEqual(expect.arrayContaining(['Lunch', 'Dinner']));
  });

  test('a menu without a name is "Menu"; a published menu can be renamed but not otherwise changed', async () => {
    const plain = await menuWith({}, 'Idli');
    expect(plain.name).toBe('Menu');

    const renamed = await request(app).put(`/api/menus/${plain.id}`).set(ownerHeaders).send({ name: 'Breakfast' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Breakfast');

    const moved = await request(app).put(`/api/menus/${plain.id}`).set(ownerHeaders).send({ name: 'Tiffin', orderingEndTime: '10:00' });
    expect(moved.body.code).toBe('INVALID_STATUS');
    expect((await request(app).put(`/api/menus/${plain.id}`).set(ownerHeaders).send({ name: '' })).status).toBe(400);
  });

});
