const request = require('supertest');
const { registerAndLogin, getAuthHeaders, cleanupAllData } = require('./helpers');
const { emailKey } = require('../src/lib/email');

let app, sequelize, models, outbox;
let adminHeaders, john;

// Emails keep their dots as typed, and Gmail spellings of one inbox are one account
describe('Emails as typed', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    ({ outbox } = require('../src/lib/mailer'));
    await sequelize.sync({ force: true });
    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'typed-admin@test.com', 'system_admin')).tokens);
    john = (await registerAndLogin(app, ' PeriyalArun@Gmail.com ', 'restaurant_admin')).user;
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const signIn = (email) => request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  const register = (email) =>
    request(app).post('/api/auth/register').send({ email, password: 'TestPass123!', firstName: 'A', lastName: 'B', role: 'customer' });

  test('the key folds what Gmail folds, and nothing for other providers', () => {
    expect(emailKey(' Periyal.Arun+food@GoogleMail.com ')).toBe('periyalarun@gmail.com');
    expect(emailKey('first.last@example.com')).toBe('first.last@example.com');
    expect(emailKey('first.last+x@outlook.com')).toBe('first.last+x@outlook.com');
  });

  test('an admin can add the dots back; the email is stored as typed', async () => {
    expect(john.email).toBe('periyalarun@gmail.com');
    const res = await request(app).put(`/api/admin/users/${john.id}/email`).set(adminHeaders).send({ email: 'periyal.arun@gmail.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('periyal.arun@gmail.com');
    expect((await models.User.findByPk(john.id)).email).toBe('periyal.arun@gmail.com');
  });

  test('signs in with any spelling of the same Gmail inbox', async () => {
    for (const email of ['periyal.arun@gmail.com', 'periyalarun@gmail.com', 'Periyal.Arun@googlemail.com']) {
      const res = await signIn(email);
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('periyal.arun@gmail.com');
    }
  });

  test("another spelling of the same inbox can't sign up again", async () => {
    expect((await register('p.e.r.i.y.a.l.arun@gmail.com')).status).toBe(409);
    expect((await register('periyalarun+second@gmail.com')).status).toBe(409);
  });

  test('a new account keeps its dots', async () => {
    const res = await register('Asha.Rao@gmail.com');
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('asha.rao@gmail.com');
  });

  test('a password reset asked for any spelling goes to the stored address', async () => {
    expect((await request(app).post('/api/auth/password-reset/request').send({ email: 'periyalarun@gmail.com' })).status).toBe(200);
    expect(outbox.at(-1).to).toBe('periyal.arun@gmail.com');
  });
});
