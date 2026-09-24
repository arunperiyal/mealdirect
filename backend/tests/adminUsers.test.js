const request = require('supertest');
const { registerAndLogin, getAuthHeaders, cleanupAllData } = require('./helpers');

let app, sequelize, models;
let adminHeaders, customer, customerHeaders, partner, otherAdmin;

// Admins find users and change the email they sign in with
describe('Admin: users and their email', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'users-admin@test.com', 'system_admin')).tokens);
    otherAdmin = (await registerAndLogin(app, 'other-admin@test.com', 'system_admin')).user;
    const c = await registerAndLogin(app, 'priya.old@test.com', 'customer');
    customer = c.user;
    customerHeaders = getAuthHeaders(c.tokens);
    partner = (await registerAndLogin(app, 'owner@test.com', 'restaurant_admin')).user;
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const changeEmail = (id, email, headers = adminHeaders) =>
    request(app).put(`/api/admin/users/${id}/email`).set(headers).send({ email });
  const signIn = (email) => request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });

  test('lists customers, partners and riders, not MealDirect staff; searches and filters', async () => {
    const all = await request(app).get('/api/admin/users').set(adminHeaders);
    expect(all.status).toBe(200);
    const emails = all.body.data.map((u) => u.email);
    expect(emails).toEqual(expect.arrayContaining(['priya.old@test.com', 'owner@test.com']));
    expect(emails).not.toContain('users-admin@test.com');
    expect(all.body.data[0].passwordHash).toBeUndefined();

    const found = await request(app).get('/api/admin/users?search=PRIYA').set(adminHeaders);
    expect(found.body.data.map((u) => u.id)).toEqual([customer.id]);

    const partners = await request(app).get('/api/admin/users?role=restaurant_admin').set(adminHeaders);
    expect(partners.body.data.map((u) => u.id)).toEqual([partner.id]);
  });

  test('changes the email; the user signs in with the new one and stays signed in', async () => {
    const res = await changeEmail(customer.id, '  Priya.New@Test.com ');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: customer.id, email: 'priya.new@test.com' });

    expect((await signIn('priya.new@test.com')).status).toBe(200);
    expect((await signIn('priya.old@test.com')).status).toBe(401);

    // Their current session keeps working and shows the new email
    const me = await request(app).get('/api/auth/me').set(customerHeaders);
    expect(me.status).toBe(200);
    expect(me.body.data.email ?? me.body.data.user?.email).toBe('priya.new@test.com');
  });

  test('refuses an email another account uses, the same email, and a bad email', async () => {
    const taken = await changeEmail(customer.id, 'owner@test.com');
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('EMAIL_EXISTS');

    expect((await changeEmail(customer.id, 'priya.new@test.com')).body.code).toBe('NO_CHANGES');
    expect((await changeEmail(customer.id, 'not-an-email')).status).toBe(400);
    expect((await changeEmail('00000000-0000-4000-8000-000000000000', 'x@test.com')).status).toBe(404);
  });

  test("an email still held by a deleted account can't be reused", async () => {
    const gone = (await registerAndLogin(app, 'gone@test.com', 'customer')).user;
    await models.User.destroy({ where: { id: gone.id } });
    expect((await changeEmail(customer.id, 'gone@test.com')).body.code).toBe('EMAIL_EXISTS');
  });

  test("staff accounts can't be changed here, and only admins can change emails", async () => {
    const staff = await changeEmail(otherAdmin.id, 'someone@test.com');
    expect(staff.status).toBe(403);

    expect((await changeEmail(partner.id, 'mine@test.com', customerHeaders)).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(customerHeaders)).status).toBe(403);
  });
});
