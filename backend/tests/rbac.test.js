const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;

describe('Role-Based Access Control (RBAC)', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');

    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  describe('Authentication & Authorization', () => {
    test('unauthenticated users cannot create restaurants', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .send({
          name: 'Test Restaurant',
          description: 'Test',
          address: 'Test address',
          city: 'Test city',
          cuisineType: 'test',
        });

      expect(response.status).toBe(401);
    });

    test('customers cannot create restaurants', async () => {
      const custResult = await registerAndLogin(app, 'customer@test.com', 'customer');
      const customerHeaders = getAuthHeaders(custResult.tokens);

      const response = await request(app)
        .post('/api/restaurants')
        .set(customerHeaders)
        .send({
          name: 'Test Restaurant',
          description: 'Test',
          address: 'Test address',
          city: 'Test city',
          cuisineType: 'test',
        });

      expect(response.status).toBe(403);
    });

    test('restaurant_admin can create restaurants', async () => {
      const restResult = await registerAndLogin(app, 'restaurant@test.com', 'restaurant_admin');
      const restaurantHeaders = getAuthHeaders(restResult.tokens);

      const response = await request(app)
        .post('/api/restaurants')
        .set(restaurantHeaders)
        .send({
          name: 'Test Restaurant',
          description: 'Test',
          address: 'Test address',
          city: 'Test city',
          cuisineType: 'test',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.ownerId).toBe(restResult.user.id);
    });
  });

  describe('Restaurant Ownership', () => {
    test('restaurant_admin cannot modify other restaurants', async () => {
      const rest1Result = await registerAndLogin(app, 'rest1@test.com', 'restaurant_admin');
      const rest2Result = await registerAndLogin(app, 'rest2@test.com', 'restaurant_admin');
      const rest1Headers = getAuthHeaders(rest1Result.tokens);
      const rest2Headers = getAuthHeaders(rest2Result.tokens);

      const rest = await createRestaurant(app, rest1Result.user.id, rest1Headers);

      const response = await request(app)
        .put(`/api/restaurants/${rest.id}`)
        .set(rest2Headers)
        .send({ name: 'Hacked Restaurant' });

      expect([403, 401]).toContain(response.status);
    });
  });

  describe('System Admin Permissions', () => {
    test('only system_admin can approve restaurants', async () => {
      const restResult = await registerAndLogin(app, 'restaurant@rbac.com', 'restaurant_admin');
      const adminResult = await registerAndLogin(app, 'admin@rbac.com', 'system_admin');
      const customerResult = await registerAndLogin(app, 'customer@rbac.com', 'customer');

      const restaurantHeaders = getAuthHeaders(restResult.tokens);
      const adminHeaders = getAuthHeaders(adminResult.tokens);
      const customerHeaders = getAuthHeaders(customerResult.tokens);

      const rest = await createRestaurant(app, restResult.user.id, restaurantHeaders);

      // Customer cannot approve
      const custRes = await request(app)
        .put(`/api/restaurants/${rest.id}/approve`)
        .set(customerHeaders)
        .send({ isApproved: true });

      expect(custRes.status).toBe(403);

      // Admin can approve
      const adminRes = await request(app)
        .put(`/api/restaurants/${rest.id}/approve`)
        .set(adminHeaders)
        .send({ isApproved: true });

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.isApproved).toBe(true);
    });
  });
});
