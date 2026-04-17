const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createUserWithRole,
  createRestaurant,
  approveRestaurant,
  createMenu,
  publishMenu,
  createOrder,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  listOrders,
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

  // ============== ORDER CREATION TESTS ==============

  describe('POST /api/orders - Create Order', () => {
    test('should create order successfully for published menu', async () => {
      const orderData = {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item 1', quantity: 1, price: 100 }],
        deliveryAddress: '123 Customer Ave',
      };

      const response = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send(orderData);

      expect(response.status).toBe(201);
      expect(response.body.data.customerId).toBe(customer.id);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.restaurantId).toBe(approvedRestaurant.id);
    });

    test('should reject order for unapproved restaurant', async () => {
      const unapprovedRest = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        email: `unappr${Date.now()}@test.com`,
      });

      const response = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: unapprovedRest.id,
          menuId: menu.id,
          items: [{ itemName: 'Item', quantity: 1, price: 100 }],
          deliveryAddress: '123 Ave',
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('not approved');
    });

    test('should reject order for unpublished menu', async () => {
      const draftMenu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);

      const response = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: draftMenu.id,
          items: [{ itemName: 'Item', quantity: 1, price: 100 }],
          deliveryAddress: '123 Ave',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not published');
    });

    test('should calculate pricing correctly', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set(customerHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [
            { itemName: 'Item 1', quantity: 2, price: 100 },
            { itemName: 'Item 2', quantity: 1, price: 50 },
          ],
          deliveryAddress: '123 Ave',
        });

      expect(response.status).toBe(201);
      const order = response.body.data;

      // Subtotal = 2*100 + 1*50 = 250
      expect(order.subtotal).toBe(250);
      // Tax = 250 * 0.05 = 12.5
      expect(order.tax).toBe(12.5);
      // Total = 250 + 12.5 + delivery fee
      expect(order.total).toBeGreaterThan(250);
    });

    test('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          restaurantId: approvedRestaurant.id,
          menuId: menu.id,
          items: [{ itemName: 'Item', quantity: 1, price: 100 }],
          deliveryAddress: '123 Ave',
        });

      expect(response.status).toBe(401);
    });
  });

  // ============== ORDER RETRIEVAL ==============

  describe('GET /api/orders/:id - Get Order', () => {
    let order;

    beforeEach(async () => {
      order = await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });
    });

    test('should retrieve order by customer', async () => {
      const response = await request(app)
        .get(`/api/orders/${order.id}`)
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(order.id);
      expect(response.body.data.customerId).toBe(customer.id);
    });

    test('should allow restaurant to view their order', async () => {
      const response = await request(app)
        .get(`/api/orders/${order.id}`)
        .set(restaurantAdminHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data.restaurantId).toBe(approvedRestaurant.id);
    });

    test('should prevent other customer from viewing order', async () => {
      const otherCustomer = await registerAndLogin(app, `other${Date.now()}@test.com`, 'customer');

      const response = await request(app)
        .get(`/api/orders/${order.id}`)
        .set(getAuthHeaders(otherCustomer.tokens));

      expect(response.status).toBe(403);
    });

    test('should return 404 for non-existent order', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/orders/${fakeId}`)
        .set(customerHeaders);

      expect(response.status).toBe(404);
    });
  });

  // ============== ORDER LIST ==============

  describe('GET /api/orders - List Orders', () => {
    beforeEach(async () => {
      await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });

      await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '456 Ave',
      });
    });

    test('should list customer orders', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data[0].customerId).toBe(customer.id);
    });

    test('should list restaurant orders', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set(restaurantAdminHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============== ORDER STATUS TRANSITIONS ==============

  describe('Order Status Workflow', () => {
    let order;

    beforeEach(async () => {
      order = await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });
    });

    test('should transition: pending -> confirmed', async () => {
      const response = await request(app)
        .post(`/api/orders/${order.id}/confirm`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('confirmed');
    });

    test('should transition: confirmed -> preparing', async () => {
      await updateOrderStatus(app, order.id, 'confirmed', restaurantAdminHeaders);

      const response = await request(app)
        .post(`/api/orders/${order.id}/preparing`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('preparing');
    });

    test('should transition: preparing -> ready', async () => {
      await updateOrderStatus(app, order.id, 'confirmed', restaurantAdminHeaders);
      await updateOrderStatus(app, order.id, 'preparing', restaurantAdminHeaders);

      const response = await request(app)
        .post(`/api/orders/${order.id}/ready`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ready');
    });

    test('should transition: ready -> delivered', async () => {
      await updateOrderStatus(app, order.id, 'confirmed', restaurantAdminHeaders);
      await updateOrderStatus(app, order.id, 'preparing', restaurantAdminHeaders);
      await updateOrderStatus(app, order.id, 'ready', restaurantAdminHeaders);

      const response = await request(app)
        .post(`/api/orders/${order.id}/delivered`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('delivered');
    });

    test('should prevent invalid state transitions', async () => {
      const response = await request(app)
        .post(`/api/orders/${order.id}/ready`)
        .set(restaurantAdminHeaders)
        .send({});

      // Can't go from pending to ready
      expect(response.status).toBe(400);
    });

    test('should prevent duplicate confirmations', async () => {
      await updateOrderStatus(app, order.id, 'confirmed', restaurantAdminHeaders);

      const response = await request(app)
        .post(`/api/orders/${order.id}/confirm`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  // ============== ORDER CANCELLATION ==============

  describe('POST /api/orders/:id/cancel - Cancel Order', () => {
    let order;

    beforeEach(async () => {
      order = await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });
    });

    test('should allow customer to cancel pending order', async () => {
      const response = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(customerHeaders)
        .send({ reason: 'Changed mind' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('cancelled');
    });

    test('should allow restaurant to cancel pending order', async () => {
      const response = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(restaurantAdminHeaders)
        .send({ reason: 'Not available' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('cancelled');
    });

    test('should prevent cancelling already cancelled order', async () => {
      await cancelOrder(app, order.id, customerHeaders);

      const response = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(customerHeaders)
        .send({ reason: 'Already cancelled' });

      expect(response.status).toBe(400);
    });

    test('should prevent cancelling delivered order', async () => {
      await updateOrderStatus(app, order.id, 'confirmed', restaurantAdminHeaders);
      await updateOrderStatus(app, order.id, 'preparing', restaurantAdminHeaders);
      await updateOrderStatus(app, order.id, 'ready', restaurantAdminHeaders);
      await updateOrderStatus(app, order.id, 'delivered', restaurantAdminHeaders);

      const response = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(customerHeaders)
        .send({ reason: 'Too late' });

      expect(response.status).toBe(400);
    });
  });

  // ============== COMPLETE ORDER WORKFLOW ==============

  describe('Complete Order Workflow', () => {
    test('should complete full order lifecycle: create -> confirm -> preparing -> ready -> delivered', async () => {
      // 1. Customer creates order
      const order = await createOrder(app, customer.id, customerHeaders, {
        restaurantId: approvedRestaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Biryani', quantity: 2, price: 200 }],
        deliveryAddress: '123 Customer Ave',
      });

      expect(order.status).toBe('pending');

      // 2. Restaurant confirms order
      let updatedOrder = await updateOrderStatus(app, order.id, 'confirmed', restaurantAdminHeaders);
      expect(updatedOrder.status).toBe('confirmed');

      // 3. Restaurant starts preparing
      updatedOrder = await updateOrderStatus(app, order.id, 'preparing', restaurantAdminHeaders);
      expect(updatedOrder.status).toBe('preparing');

      // 4. Food is ready
      updatedOrder = await updateOrderStatus(app, order.id, 'ready', restaurantAdminHeaders);
      expect(updatedOrder.status).toBe('ready');

      // 5. Order delivered
      updatedOrder = await updateOrderStatus(app, order.id, 'delivered', restaurantAdminHeaders);
      expect(updatedOrder.status).toBe('delivered');

      // 6. Customer can view completed order
      const finalOrder = await getOrder(app, order.id, customerHeaders);
      expect(finalOrder.status).toBe('delivered');
      expect(finalOrder.subtotal).toBe(400); // 2 * 200
    });
  });
});
