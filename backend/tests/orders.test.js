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
let customer, systemAdmin;
let customerHeaders, adminHeaders;
let restaurantAdmin, restaurantAdminHeaders;
let approvedRestaurant, menu;

describe('Order Management API', () => {
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
  });

  describe('POST /api/orders - Create Order', () => {
    test('should create order successfully for published menu', async () => {
      const menuItem = menu.items[0];
      const response = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: menuItem.id, quantity: 1 }],
          deliveryAddress: '123 Customer Ave',
          deliveryType: 'delivery',
          paymentMethod: 'cod',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.customerId).toBe(customer.id);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.restaurantId).toBe(approvedRestaurant.id);
    });

    test('should reject order without authentication', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: 'some-id', quantity: 1 }],
          deliveryType: 'delivery',
          paymentMethod: 'cod',
        });

      expect(response.status).toBe(401);
    });

    test('should reject order with missing items', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [],
          deliveryType: 'delivery',
          paymentMethod: 'cod',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/orders/:id - Get Order', () => {
    test('should retrieve order by customer', async () => {
      const menuItem = menu.items[0];
      const createRes = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: menuItem.id, quantity: 1 }],
          deliveryAddress: '123 Ave',
          deliveryType: 'delivery',
          paymentMethod: 'cod',
        });

      const orderId = createRes.body.data.id;

      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(orderId);
      expect(response.body.data.customerId).toBe(customer.id);
    });
  });

  describe('GET /api/orders - List Orders', () => {
    test('should list customer orders', async () => {
      const menuItem = menu.items[0];
      await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: menuItem.id, quantity: 1 }],
          deliveryAddress: '123 Ave',
          deliveryType: 'delivery',
          paymentMethod: 'cod',
        });

      const response = await request(app)
        .get('/api/orders')
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].customerId).toBe(customer.id);
    });
  });

  describe('POST /api/orders/:id/cancel - Cancel Order', () => {
    test('should cancel pending order', async () => {
      const menuItem = menu.items[0];
      const createRes = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: menuItem.id, quantity: 1 }],
          deliveryAddress: '123 Ave',
          deliveryType: 'delivery',
          paymentMethod: 'cod',
        });

      const orderId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set(customerHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('cancelled');
    });
  });
});
