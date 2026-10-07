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

let app, sequelize, models;
let customerHeaders, otherHeaders, ownerHeaders, restaurant, menu;

describe('Saved addresses', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    const adminHeaders = getAuthHeaders((await registerAndLogin(app, 'addr-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'addr-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'addr-cust@test.com', 'customer')).tokens);
    otherHeaders = getAuthHeaders((await registerAndLogin(app, 'addr-other@test.com', 'customer')).tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Address Kitchen' });
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, { deliveryEnabled: true, pickupEnabled: true });
    menu = await publishMenu(app, (await createMenu(app, restaurant.id, ownerHeaders)).id, ownerHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const add = (body, headers = customerHeaders) => request(app).post('/api/addresses').set(headers).send(body);
  const list = (headers = customerHeaders) => request(app).get('/api/addresses').set(headers);

  test('saves, edits and removes addresses; each customer sees only their own', async () => {
    const home = await add({ label: ' Home ', address: '12 MG Road, Flat 4B, Bengaluru' });
    expect(home.status).toBe(201);
    expect(home.body.data).toMatchObject({ label: 'Home', address: '12 MG Road, Flat 4B, Bengaluru', lastUsedAt: null });
    const work = (await add({ label: 'Work', address: '5 Tech Park, Tower C' })).body.data;

    expect((await list()).body.data.map((a) => a.label)).toEqual(['Work', 'Home']);
    expect((await list(otherHeaders)).body.data).toEqual([]);

    const edited = await request(app).put(`/api/addresses/${work.id}`).set(customerHeaders).send({ address: '6 Tech Park, Tower D' });
    expect(edited.body.data).toMatchObject({ label: 'Work', address: '6 Tech Park, Tower D' });

    expect((await request(app).put(`/api/addresses/${work.id}`).set(otherHeaders).send({ label: 'Mine' })).status).toBe(404);
    expect((await request(app).delete(`/api/addresses/${work.id}`).set(otherHeaders)).status).toBe(404);
    expect((await request(app).delete(`/api/addresses/${work.id}`).set(customerHeaders)).status).toBe(200);
    expect((await list()).body.data.map((a) => a.label)).toEqual(['Home']);
  });

  test('ordering to a saved address moves it to the top', async () => {
    await add({ label: 'Parents', address: '9 Lake View, Mysuru' });
    expect((await list()).body.data[0].label).toBe('Parents');

    const order = await request(app)
      .post('/api/orders')
      .set(customerHeaders)
      .send({
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType: 'delivery',
        deliveryAddress: '12 MG Road, Flat 4B, Bengaluru',
        paymentMethod: 'cod',
      });
    expect(order.status).toBe(201);
    const [first] = (await list()).body.data;
    expect(first).toMatchObject({ label: 'Home' });
    expect(first.lastUsedAt).not.toBeNull();
  });

  test('checks the input, the limit, and who may use it', async () => {
    expect((await add({ label: '', address: '12 MG Road' })).status).toBe(400);
    expect((await add({ label: 'Home', address: 'x' })).status).toBe(400);
    expect((await list(ownerHeaders)).status).toBe(403);

    for (let i = 0; i < 8; i++) await add({ label: `Place ${i}`, address: `${i} Long Street, Pune` });
    const full = await add({ label: 'One more', address: '11 Long Street, Pune' });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('TOO_MANY_ADDRESSES');
  });
});
