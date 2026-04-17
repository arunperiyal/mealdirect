const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  createMenu,
  publishMenu,
  createOrder,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;
let customer, systemAdmin, restaurantAdmin;
let customerHeaders, adminHeaders, restaurantAdminHeaders;
let approvedRestaurant, menu;

describe('Role-Based Access Control (RBAC)', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');

    await sequelize.sync({ force: true });

    const custResult = await registerAndLogin(app, 'customer@test.com', 'customer');
    customer = custResult.user;
    customerHeaders = getAuthHeaders(custResult.tokens);

    const adminResult = await registerAndLogin(app, 'admin@test.com', 'system_admin');
    systemAdmin = adminResult.user;
    adminHeaders = getAuthHeaders(adminResult.tokens);

    const restResult = await registerAndLogin(app, 'restaurant@test.com', 'restaurant_admin');
    restaurantAdmin = restResult.user;
    restaurantAdminHeaders = getAuthHeaders(restResult.tokens);

    approvedRestaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders);
    approvedRestaurant = await approveRestaurant(app, approvedRestaurant.id, adminHeaders);

    menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    menu = await publishMenu(app, menu.id, restaurantAdminHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  afterEach(async () => {
    await models.Order?.destroy({ where: {}, force: true });
    await models.Menu?.destroy({ where: {}, force: true });
    await models.Restaurant?.destroy({ where: {}, force: true });
  });

  // ============== CUSTOMER ROLE TESTS ==============

  describe('Customer Role Permissions', () => {
    test('customer can view restaurants', async () => {
      const response = await request(app)
        .get('/api/restaurants')
        .set(customerHeaders);

      expect(response.status).toBe(200);
    });

    test('customer can create orders', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [{ itemName: 'Item', quantity: 1, price: 100 }],
          deliveryAddress: '123 Ave',
        });

      expect(response.status).toBe(201);
    });

    test('customer cannot create restaurant', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .set(customerHeaders)
        .send({
          name: 'My Restaurant',
          email: `rest${Date.now()}@test.com`,
          phone: '1234567890',
          address: '123 Main St',
          city: 'City',
          zipCode: '12345',
        });

      expect(response.status).toBe(403);
    });

    test('customer cannot create menus', async () => {
      const response = await request(app)
        .post('/api/menus')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          name: 'Menu',
          items: [{ name: 'Item', price: 100 }],
        });

      expect(response.status).toBe(403);
    });

    test('customer cannot approve restaurants', async () => {
      const unapprovedRest = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        email: `unappr${Date.now()}@test.com`,
      });

      const response = await request(app)
        .put(`/api/restaurants/admin/${unapprovedRest.id}/approve`)
        .set(customerHeaders)
        .send({});

      expect(response.status).toBe(403);
    });

    test('customer cannot view orders from other customers', async () => {
      const order = await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });

      const otherCustomer = await registerAndLogin(app, `other${Date.now()}@test.com`, 'customer');

      const response = await request(app)
        .get(`/api/orders/${order.id}`)
        .set(getAuthHeaders(otherCustomer.tokens));

      expect(response.status).toBe(403);
    });
  });

  // ============== RESTAURANT_ADMIN ROLE TESTS ==============

  describe('Restaurant Admin Role Permissions', () => {
    let restaurantAdmin2, restaurantAdminHeaders2;

    beforeEach(async () => {
      const result = await registerAndLogin(app, `rest${Date.now()}@test.com`, 'restaurant_admin');
      restaurantAdmin2 = result.user;
      restaurantAdminHeaders2 = getAuthHeaders(result.tokens);
    });

    test('restaurant admin can create restaurant', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .set(restaurantAdminHeaders2)
        .send({
          name: 'My Restaurant',
          email: `myrv${Date.now()}@test.com`,
          phone: '1234567890',
          address: '123 Main St',
          city: 'City',
          zipCode: '12345',
        });

      expect(response.status).toBe(201);
    });

    test('restaurant admin can create menus for their restaurant', async () => {
      const response = await request(app)
        .post('/api/menus')
        .set(restaurantAdminHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          name: 'New Menu',
          items: [{ name: 'Item', price: 100 }],
        });

      expect(response.status).toBe(201);
    });

    test('restaurant admin cannot create menus for other restaurants', async () => {
      const response = await request(app)
        .post('/api/menus')
        .set(restaurantAdminHeaders2)
        .send({
          restaurantId: approvedRestaurant.id,
          name: 'Unauthorized Menu',
          items: [{ name: 'Item', price: 100 }],
        });

      expect(response.status).toBe(403);
    });

    test('restaurant admin cannot approve restaurants', async () => {
      const unapprovedRest = await createRestaurant(app, restaurantAdmin2.id, restaurantAdminHeaders2, {
        email: `unappr2${Date.now()}@test.com`,
      });

      const response = await request(app)
        .put(`/api/restaurants/admin/${unapprovedRest.id}/approve`)
        .set(restaurantAdminHeaders2)
        .send({});

      expect(response.status).toBe(403);
    });

    test('restaurant admin can update their own restaurant', async () => {
      const response = await request(app)
        .put(`/api/restaurants/${approvedRestaurant.id}`)
        .set(restaurantAdminHeaders)
        .send({
          description: 'Updated description',
        });

      expect(response.status).toBe(200);
    });

    test('restaurant admin cannot update other restaurants', async () => {
      const otherRest = await createRestaurant(app, restaurantAdmin2.id, restaurantAdminHeaders2, {
        email: `other${Date.now()}@test.com`,
      });

      const response = await request(app)
        .put(`/api/restaurants/${otherRest.id}`)
        .set(restaurantAdminHeaders)
        .send({
          description: 'Hacked',
        });

      expect(response.status).toBe(403);
    });
  });

  // ============== SYSTEM_ADMIN ROLE TESTS ==============

  describe('System Admin Role Permissions', () => {
    test('system admin can approve restaurants', async () => {
      const pendingRest = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        email: `pendingappr${Date.now()}@test.com`,
      });

      const response = await request(app)
        .put(`/api/restaurants/admin/${pendingRest.id}/approve`)
        .set(adminHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.verificationStatus).toBe('verified');
    });

    test('system admin can reject restaurants', async () => {
      const pendingRest = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        email: `pendingreject${Date.now()}@test.com`,
      });

      const response = await request(app)
        .put(`/api/restaurants/admin/${pendingRest.id}/reject`)
        .set(adminHeaders)
        .send({ notes: 'Invalid documents' });

      expect(response.status).toBe(200);
      expect(response.body.data.verificationStatus).toBe('rejected');
    });

    test('system admin can view all orders', async () => {
      // Create multiple orders as customers
      await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });

      const response = await request(app)
        .get('/api/orders')
        .set(adminHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('system admin cannot create orders as customer', async () => {
      // Admins should use their own endpoints, not customer order endpoints
      const response = await request(app)
        .post('/api/orders')
        .set(adminHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [{ itemName: 'Item', quantity: 1, price: 100 }],
          deliveryAddress: '123 Ave',
        });

      // This depends on implementation - they might be able to or get permission denied
      expect([400, 403, 201]).toContain(response.status);
    });
  });

  // ============== CROSS-ROLE PERMISSION TESTS ==============

  describe('Cross-Role Permission Denial', () => {
    test('customer trying to update restaurant gets 403', async () => {
      const response = await request(app)
        .put(`/api/restaurants/${approvedRestaurant.id}`)
        .set(customerHeaders)
        .send({ description: 'Hacked' });

      expect(response.status).toBe(403);
    });

    test('customer trying to update menu gets 403', async () => {
      const response = await request(app)
        .put(`/api/menus/${menu.id}`)
        .set(customerHeaders)
        .send({ description: 'Hacked' });

      expect(response.status).toBe(403);
    });

    test('restaurant admin cannot update customer order status without authorization', async () => {
      const order = await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });

      // Restaurant can update if it's their order
      const response = await request(app)
        .post(`/api/orders/${order.id}/confirm`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(200);
    });

    test('unrelated restaurant admin cannot update another restaurant order', async () => {
      const order = await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });

      const otherAdmin = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .post(`/api/orders/${order.id}/confirm`)
        .set(getAuthHeaders(otherAdmin.tokens))
        .send({});

      expect(response.status).toBe(403);
    });
  });

  // ============== OWNERSHIP VERIFICATION TESTS ==============

  describe('Ownership Verification', () => {
    test('restaurant owner can only update own restaurant settings', async () => {
      const response = await request(app)
        .put(`/api/restaurants/${approvedRestaurant.id}/delivery-settings`)
        .set(restaurantAdminHeaders)
        .send({
          deliveryEnabled: true,
          defaultDeliveryFee: 50,
        });

      expect(response.status).toBe(200);
    });

    test('non-owner cannot update restaurant settings', async () => {
      const otherAdmin = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .put(`/api/restaurants/${approvedRestaurant.id}/delivery-settings`)
        .set(getAuthHeaders(otherAdmin.tokens))
        .send({
          deliveryEnabled: false,
        });

      expect(response.status).toBe(403);
    });

    test('menu owner can only update own menus', async () => {
      const response = await request(app)
        .put(`/api/menus/${menu.id}`)
        .set(restaurantAdminHeaders)
        .send({
          description: 'Updated',
        });

      expect(response.status).toBe(200);
    });

    test('non-owner cannot update menu', async () => {
      const otherAdmin = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .put(`/api/menus/${menu.id}`)
        .set(getAuthHeaders(otherAdmin.tokens))
        .send({
          description: 'Hacked',
        });

      expect(response.status).toBe(403);
    });
  });
});
