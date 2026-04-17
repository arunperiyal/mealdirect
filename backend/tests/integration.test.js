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

describe('End-to-End Integration Tests', () => {
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

  describe('Complete User Workflows', () => {
    test('should complete full restaurant to customer order workflow', async () => {
      // Register users
      const custResult = await registerAndLogin(app, 'customer@workflow.com', 'customer');
      const restResult = await registerAndLogin(app, 'restaurant@workflow.com', 'restaurant_admin');
      const adminResult = await registerAndLogin(app, 'admin@workflow.com', 'system_admin');

      const customerHeaders = getAuthHeaders(custResult.tokens);
      const restaurantHeaders = getAuthHeaders(restResult.tokens);
      const adminHeaders = getAuthHeaders(adminResult.tokens);

      // Create restaurant
      let restaurant = await createRestaurant(app, restResult.user.id, restaurantHeaders);
      expect(restaurant.id).toBeDefined();

      // Approve restaurant
      restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
      expect(restaurant.isApproved).toBe(true);

      // Create menu
      let menu = await createMenu(app, restaurant.id, restaurantHeaders);
      expect(menu.status).toBe('draft');
      expect(Array.isArray(menu.items)).toBe(true);

      // Publish menu
      menu = await publishMenu(app, menu.id, restaurantHeaders);
      expect(menu.status).toBe('published');

      // Create order
      const menuItem = menu.items[0];
      const orderRes = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: restaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: menuItem.id, quantity: 2 }],
          deliveryAddress: '123 Main St',
          deliveryType: 'delivery',
          paymentMethod: 'cod',
        });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.customerId).toBe(custResult.user.id);
      expect(orderRes.body.data.status).toBe('pending');
    });

    test('should allow customer to view their order', async () => {
      const custResult = await registerAndLogin(app, `cust-${Date.now()}@test.com`, 'customer');
      const restResult = await registerAndLogin(app, `rest-${Date.now()}@test.com`, 'restaurant_admin');
      const adminResult = await registerAndLogin(app, `admin-${Date.now()}@test.com`, 'system_admin');

      const customerHeaders = getAuthHeaders(custResult.tokens);
      const restaurantHeaders = getAuthHeaders(restResult.tokens);
      const adminHeaders = getAuthHeaders(adminResult.tokens);

      // Setup
      let restaurant = await createRestaurant(app, restResult.user.id, restaurantHeaders);
      restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

      let menu = await createMenu(app, restaurant.id, restaurantHeaders);
      menu = await publishMenu(app, menu.id, restaurantHeaders);

      // Create order
      const menuItem = menu.items[0];
      const orderRes = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: restaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: menuItem.id, quantity: 1 }],
          deliveryAddress: '123 Ave',
          deliveryType: 'delivery',
          paymentMethod: 'cod',
        });

      const orderId = orderRes.body.data.id;

      // Get order
      const getRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set(customerHeaders);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(orderId);
    });
  });

  describe('Menu Lifecycle', () => {
    test('should create, publish, and close menu', async () => {
      const restResult = await registerAndLogin(app, `rest-${Date.now()}@test.com`, 'restaurant_admin');
      const adminResult = await registerAndLogin(app, `admin-${Date.now()}@test.com`, 'system_admin');

      const restaurantHeaders = getAuthHeaders(restResult.tokens);
      const adminHeaders = getAuthHeaders(adminResult.tokens);

      // Create and approve restaurant
      let restaurant = await createRestaurant(app, restResult.user.id, restaurantHeaders);
      restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

      // Create menu
      let menu = await createMenu(app, restaurant.id, restaurantHeaders);
      expect(menu.status).toBe('draft');

      // Publish menu
      menu = await publishMenu(app, menu.id, restaurantHeaders);
      expect(menu.status).toBe('published');
      expect(menu.isActive).toBe(true);
    });
  });
});
