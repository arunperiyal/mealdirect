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
let adminHeaders, owner, ownerHeaders, restaurant, menu;

const PASSWORD = 'TestPass123!';

// Users delete their own accounts; admins delete and restore them. Deletion is soft.
describe('Deleting accounts', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'del-admin@test.com', 'system_admin')).tokens);
    owner = await registerAndLogin(app, 'del-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Gone Kitchen' });
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, { deliveryEnabled: true, pickupEnabled: true });
    menu = await publishMenu(app, (await createMenu(app, restaurant.id, ownerHeaders)).id, ownerHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const place = (headers) =>
    request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
        deliveryType: 'delivery',
        deliveryAddress: '1 Gone Street',
        paymentMethod: 'cod',
      });
  const deleteMe = (headers, password = PASSWORD) =>
    request(app).delete('/api/auth/me').set(headers).send({ password });
  const signIn = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

  test('a customer deletes their account once their orders are finished', async () => {
    const { user, tokens } = await registerAndLogin(app, 'leaving@test.com', 'customer');
    const headers = getAuthHeaders(tokens);

    expect((await deleteMe(headers, 'WrongPass123!')).body.code).toBe('INVALID_PASSWORD');

    const order = (await place(headers)).body.data;
    const blocked = await deleteMe(headers);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('ACTIVE_ORDERS');

    await request(app).post(`/api/orders/${order.id}/cancel`).set(headers).send({ reason: 'Leaving' });
    expect((await deleteMe(headers)).status).toBe(200);

    // Signed out everywhere at once
    const me = await request(app).get('/api/auth/me').set(headers);
    expect(me.status).toBe(401);
    expect(me.body.code).toBe('ACCOUNT_DELETED');
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(refresh.body.code).toBe('ACCOUNT_DELETED');

    // Only the right password learns the account was deleted
    expect((await signIn('leaving@test.com')).body.code).toBe('ACCOUNT_DELETED');
    expect((await signIn('leaving@test.com', 'WrongPass123!')).status).toBe(401);

    // The email stays with the account, so it can be restored
    const again = await request(app)
      .post('/api/auth/register')
      .send({ email: 'leaving@test.com', password: PASSWORD, firstName: 'New' });
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/deleted/);

    // The restaurant still sees who placed the old order
    const seen = await request(app).get(`/api/orders/${order.id}`).set(ownerHeaders);
    expect(seen.body.data.customer).toMatchObject({ id: user.id, firstName: 'Customer', avatarUrl: null });

    // Admins see it among deleted accounts, deleted by the user themselves
    const deleted = await request(app).get('/api/admin/users?deleted=true').set(adminHeaders);
    expect(deleted.body.data).toEqual([expect.objectContaining({ id: user.id, deletedBy: 'self' })]);
    const active = await request(app).get('/api/admin/users').set(adminHeaders);
    expect(active.body.data.map((u) => u.id)).not.toContain(user.id);

    // Restored, they sign in again
    const restored = await request(app).post(`/api/admin/users/${user.id}/restore`).set(adminHeaders);
    expect(restored.status).toBe(200);
    expect(restored.body.data.deletedAt).toBeUndefined();
    expect((await signIn('leaving@test.com')).status).toBe(200);
  });

  test("an admin deletes a partner, which takes down their restaurants until it's restored", async () => {
    const res = await request(app).delete(`/api/admin/users/${owner.user.id}`).set(adminHeaders);
    expect(res.status).toBe(200);

    expect((await request(app).get(`/api/restaurants/${restaurant.id}`)).status).toBe(404);
    const deleted = await request(app).get('/api/admin/users?deleted=true&role=restaurant_admin').set(adminHeaders);
    expect(deleted.body.data[0]).toMatchObject({ id: owner.user.id, deletedBy: 'admin' });

    await request(app).post(`/api/admin/users/${owner.user.id}/restore`).set(adminHeaders);
    expect((await request(app).get(`/api/restaurants/${restaurant.id}`)).status).toBe(200);
  });

  test("a partner can't delete their account while their restaurant has open orders", async () => {
    const customer = getAuthHeaders((await registerAndLogin(app, 'hungry@test.com', 'customer')).tokens);
    const order = (await place(customer)).body.data;

    const res = await deleteMe(ownerHeaders);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACTIVE_ORDERS');
    expect((await request(app).delete(`/api/admin/users/${owner.user.id}`).set(adminHeaders)).status).toBe(409);

    await request(app).post(`/api/orders/${order.id}/cancel`).set(customer).send({ reason: 'x' });
  });

  test('a rider holding cash settles it before the account is deleted', async () => {
    const signup = await request(app).post('/api/auth/register').send({
      email: 'del-rider@test.com',
      password: PASSWORD,
      firstName: 'Ravi',
      phone: '9876500077',
      role: 'delivery_partner',
    });
    const rider = signup.body.data.user;
    const riderHeaders = getAuthHeaders({ accessToken: signup.body.data.accessToken });
    await request(app).put(`/api/admin/riders/${rider.id}/approve`).set(adminHeaders);

    const customer = getAuthHeaders((await registerAndLogin(app, 'paid-cash@test.com', 'customer')).tokens);
    const order = (await place(customer)).body.data;
    const step = (path, headers, body = {}) => request(app).post(path).set(headers).send(body);
    await step(`/api/orders/${order.id}/confirm`, ownerHeaders);
    await step(`/api/delivery/orders/${order.id}/claim`, riderHeaders);

    expect((await deleteMe(riderHeaders)).body.code).toBe('ACTIVE_DELIVERIES');

    await step(`/api/orders/${order.id}/mark-preparing`, ownerHeaders);
    await step(`/api/orders/${order.id}/mark-ready`, ownerHeaders);
    await step(`/api/delivery/orders/${order.id}/pick-up`, riderHeaders);
    await step(`/api/delivery/orders/${order.id}/deliver`, riderHeaders, { collection: 'cash' });

    const owed = await request(app).delete(`/api/admin/users/${rider.id}`).set(adminHeaders);
    expect(owed.body.code).toBe('CASH_NOT_SETTLED');

    await step(`/api/admin/riders/${rider.id}/settlements`, adminHeaders, { kind: 'payment', amount: Number(order.total) });
    expect((await deleteMe(riderHeaders)).status).toBe(200);
  });

  test("staff accounts aren't deleted here, and only admins delete other people", async () => {
    const otherAdmin = (await registerAndLogin(app, 'del-admin2@test.com', 'system_admin')).user;
    expect((await request(app).delete(`/api/admin/users/${otherAdmin.id}`).set(adminHeaders)).status).toBe(403);
    expect((await deleteMe(adminHeaders, PASSWORD)).status).toBe(403);

    const customer = await registerAndLogin(app, 'nosy@test.com', 'customer');
    const res = await request(app).delete(`/api/admin/users/${owner.user.id}`).set(getAuthHeaders(customer.tokens));
    expect(res.status).toBe(403);
  });
});
