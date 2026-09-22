const request = require('supertest');

let app, sequelize, models, userController;

const register = (body) =>
  request(app)
    .post('/api/auth/register')
    .send({ password: 'TestPass123!', firstName: 'Test', lastName: 'User', ...body });

describe('Signup roles and system admin creation', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    userController = require('../src/controllers/userController');
    await sequelize.sync({ force: true });
  });

  afterEach(async () => {
    await models.User.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/auth/register', () => {
    test('refuses to create a system admin and stores nothing', async () => {
      const response = await register({ email: 'attacker@test.com', role: 'system_admin' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('ROLE_NOT_ALLOWED');
      expect(await models.User.count({ where: { email: 'attacker@test.com' } })).toBe(0);
    });

    test('rejects unknown roles', async () => {
      const response = await register({ email: 'odd@test.com', role: 'superuser' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_ROLE');
    });

    test('defaults to customer', async () => {
      const response = await register({ email: 'plain@test.com' });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('customer');
    });

    test('still lets restaurant owners sign up', async () => {
      const response = await register({ email: 'owner@test.com', role: 'restaurant_admin' });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('restaurant_admin');
    });
  });

  describe('createSystemAdmin', () => {
    test('creates an admin who can log in and reach admin-only endpoints', async () => {
      const admin = await userController.createSystemAdmin({
        email: 'root@test.com',
        password: 'Admin-Password-123',
        firstName: 'Root',
      });
      expect(admin.role).toBe('system_admin');
      expect(admin.passwordHash).toBeUndefined();

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'root@test.com', password: 'Admin-Password-123' });
      expect(login.status).toBe(200);

      const adminOnly = await request(app)
        .get('/api/test/admin')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);
      expect(adminOnly.status).toBe(200);
    });

    test('normalizes the email the same way login does', async () => {
      await userController.createSystemAdmin({
        email: 'First.Last@Gmail.com',
        password: 'Admin-Password-123',
      });

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'First.Last@Gmail.com', password: 'Admin-Password-123' });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe('system_admin');
    });

    test('rejects duplicate emails, short passwords and invalid emails', async () => {
      await userController.createSystemAdmin({ email: 'dup@test.com', password: 'Admin-Password-123' });

      await expect(
        userController.createSystemAdmin({ email: 'dup@test.com', password: 'Admin-Password-123' })
      ).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });

      await expect(
        userController.createSystemAdmin({ email: 'short@test.com', password: 'Short-123' })
      ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });

      await expect(
        userController.createSystemAdmin({ email: 'not-an-email', password: 'Admin-Password-123' })
      ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    });
  });
});
