const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  createMenu,
  publishMenu,
  createOrder,
  updateOrderStatus,
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

  afterEach(async () => {
    await models.Order?.destroy({ where: {}, force: true });
    await models.DeliverySlot?.destroy({ where: {}, force: true });
    await models.Menu?.destroy({ where: {}, force: true });
    await models.Restaurant?.destroy({ where: {}, force: true });
  });

  // ============== COMPLETE ORDER WORKFLOW ==============

  describe('Complete Order Workflow: Restaurant Setup -> Customer Order -> Delivery', () => {
    test('full workflow from restaurant setup to order delivery', async () => {
      // 1. Restaurant owner registers
      const restResult = await registerAndLogin(app, `rest${Date.now()}@test.com`, 'restaurant_admin');
      const restaurantOwner = restResult.user;
      const restaurantHeaders = getAuthHeaders(restResult.tokens);

      // 2. System admin registers
      const adminResult = await registerAndLogin(app, `admin${Date.now()}@test.com`, 'system_admin');
      const systemAdmin = adminResult.user;
      const adminHeaders = getAuthHeaders(adminResult.tokens);

      // 3. Customer registers
      const custResult = await registerAndLogin(app, `cust${Date.now()}@test.com`, 'customer');
      const customer = custResult.user;
      const customerHeaders = getAuthHeaders(custResult.tokens);

      // 4. Restaurant owner creates restaurant (pending approval)
      const restaurant = await createRestaurant(app, restaurantOwner.id, restaurantHeaders, {
        name: 'Integration Test Restaurant',
        email: `integrated${Date.now()}@test.com`,
      });

      expect(restaurant.verificationStatus).toBe('pending');
      expect(restaurant.isApproved).toBe(false);

      // 5. System admin approves restaurant
      const approvedRest = await approveRestaurant(app, restaurant.id, adminHeaders);

      expect(approvedRest.verificationStatus).toBe('verified');
      expect(approvedRest.isApproved).toBe(true);

      // 6. Restaurant owner creates menu (draft)
      const menu = await createMenu(app, restaurant.id, restaurantHeaders, {
        name: 'Opening Day Menu',
        items: [
          { name: 'Biryani', description: 'Special biryani', price: 250, quantity: 50 },
          { name: 'Raita', description: 'Cooling raita', price: 50, quantity: 100 },
        ],
      });

      expect(menu.status).toBe('draft');

      // 7. Restaurant owner publishes menu
      const publishedMenu = await publishMenu(app, menu.id, restaurantHeaders);

      expect(publishedMenu.status).toBe('published');

      // 8. Customer browses and places order
      const order = await createOrder(app, customer.id, customerHeaders, {
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [
          { itemName: 'Biryani', quantity: 2, price: 250 },
          { itemName: 'Raita', quantity: 2, price: 50 },
        ],
        deliveryAddress: '789 Integration Ave',
      });

      expect(order.status).toBe('pending');
      expect(order.customerId).toBe(customer.id);
      expect(order.restaurantId).toBe(restaurant.id);
      // Subtotal = 2*250 + 2*50 = 600
      expect(order.subtotal).toBe(600);

      // 9. Restaurant confirms order
      let currentOrder = await updateOrderStatus(app, order.id, 'confirmed', restaurantHeaders);
      expect(currentOrder.status).toBe('confirmed');

      // 10. Restaurant starts preparing
      currentOrder = await updateOrderStatus(app, order.id, 'preparing', restaurantHeaders);
      expect(currentOrder.status).toBe('preparing');

      // 11. Food is ready
      currentOrder = await updateOrderStatus(app, order.id, 'ready', restaurantHeaders);
      expect(currentOrder.status).toBe('ready');

      // 12. Order delivered
      currentOrder = await updateOrderStatus(app, order.id, 'delivered', restaurantHeaders);
      expect(currentOrder.status).toBe('delivered');

      // 13. Verify final order state
      const finalOrderResp = await request(app)
        .get(`/api/orders/${order.id}`)
        .set(customerHeaders);

      expect(finalOrderResp.status).toBe(200);
      expect(finalOrderResp.body.data.status).toBe('delivered');
    });
  });

  // ============== MULTIPLE RESTAURANTS ==============

  describe('Multi-Restaurant Scenario', () => {
    test('customer can order from multiple restaurants', async () => {
      // Setup 2 restaurants
      const rest1Result = await registerAndLogin(app, `rest1${Date.now()}@test.com`, 'restaurant_admin');
      const rest1Headers = getAuthHeaders(rest1Result.tokens);

      const rest2Result = await registerAndLogin(app, `rest2${Date.now()}@test.com`, 'restaurant_admin');
      const rest2Headers = getAuthHeaders(rest2Result.tokens);

      const adminResult = await registerAndLogin(app, `admin${Date.now()}@test.com`, 'system_admin');
      const adminHeaders = getAuthHeaders(adminResult.tokens);

      const custResult = await registerAndLogin(app, `cust${Date.now()}@test.com`, 'customer');
      const customerHeaders = getAuthHeaders(custResult.tokens);

      // Create and approve restaurants
      let rest1 = await createRestaurant(app, rest1Result.user.id, rest1Headers, {
        name: 'Restaurant 1',
        email: `r1${Date.now()}@test.com`,
      });
      rest1 = await approveRestaurant(app, rest1.id, adminHeaders);

      let rest2 = await createRestaurant(app, rest2Result.user.id, rest2Headers, {
        name: 'Restaurant 2',
        email: `r2${Date.now()}@test.com`,
      });
      rest2 = await approveRestaurant(app, rest2.id, adminHeaders);

      // Create and publish menus
      let menu1 = await createMenu(app, rest1.id, rest1Headers);
      menu1 = await publishMenu(app, menu1.id, rest1Headers);

      let menu2 = await createMenu(app, rest2.id, rest2Headers);
      menu2 = await publishMenu(app, menu2.id, rest2Headers);

      // Customer places orders with both restaurants
      const order1 = await createOrder(app, custResult.user.id, customerHeaders, {
        restaurantId: rest1.id,
        menuId: menu1.id,
        items: [{ itemName: 'Item 1', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });

      const order2 = await createOrder(app, custResult.user.id, customerHeaders, {
        restaurantId: rest2.id,
        menuId: menu2.id,
        items: [{ itemName: 'Item 2', quantity: 2, price: 150 }],
        deliveryAddress: '456 Ave',
      });

      // Verify customer can see both orders
      const orderListResp = await request(app)
        .get('/api/orders')
        .set(customerHeaders);

      expect(orderListResp.status).toBe(200);
      const orderIds = orderListResp.body.data.map(o => o.id);
      expect(orderIds).toContain(order1.id);
      expect(orderIds).toContain(order2.id);

      // Verify each restaurant sees only their own orders
      const rest1OrdersResp = await request(app)
        .get('/api/orders')
        .set(rest1Headers);

      const rest1OrderIds = rest1OrdersResp.body.data.map(o => o.id);
      expect(rest1OrderIds).toContain(order1.id);
      expect(rest1OrderIds).not.toContain(order2.id);

      const rest2OrdersResp = await request(app)
        .get('/api/orders')
        .set(rest2Headers);

      const rest2OrderIds = rest2OrdersResp.body.data.map(o => o.id);
      expect(rest2OrderIds).toContain(order2.id);
      expect(rest2OrderIds).not.toContain(order1.id);
    });
  });

  // ============== CONCURRENT ORDERS ==============

  describe('Multiple Concurrent Orders', () => {
    test('handle multiple customers placing orders simultaneously', async () => {
      const adminResult = await registerAndLogin(app, `admin${Date.now()}@test.com`, 'system_admin');
      const adminHeaders = getAuthHeaders(adminResult.tokens);

      const restResult = await registerAndLogin(app, `rest${Date.now()}@test.com`, 'restaurant_admin');
      const restHeaders = getAuthHeaders(restResult.tokens);

      let restaurant = await createRestaurant(app, restResult.user.id, restHeaders, {
        name: 'Popular Restaurant',
        email: `popular${Date.now()}@test.com`,
      });
      restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

      let menu = await createMenu(app, restaurant.id, restHeaders);
      menu = await publishMenu(app, menu.id, restHeaders);

      // Create 5 customers placing orders
      const orders = [];
      for (let i = 0; i < 5; i++) {
        const custResult = await registerAndLogin(
          app,
          `cust${i}${Date.now()}@test.com`,
          'customer'
        );
        const order = await createOrder(app, custResult.user.id, getAuthHeaders(custResult.tokens), {
          restaurantId: restaurant.id,
          menuId: menu.id,
          items: [{ itemName: `Item ${i}`, quantity: 1, price: 100 + i * 10 }],
          deliveryAddress: `${i} Ave`,
        });
        orders.push(order);
      }

      // Verify all orders exist
      expect(orders.length).toBe(5);
      orders.forEach(order => {
        expect(order.status).toBe('pending');
        expect(order.restaurantId).toBe(restaurant.id);
      });
    });
  });

  // ============== ORDER CANCELLATION WORKFLOW ==============

  describe('Order Cancellation Workflow', () => {
    test('customer can cancel pending order and order state updates', async () => {
      const restResult = await registerAndLogin(app, `rest${Date.now()}@test.com`, 'restaurant_admin');
      const restHeaders = getAuthHeaders(restResult.tokens);

      const adminResult = await registerAndLogin(app, `admin${Date.now()}@test.com`, 'system_admin');
      const adminHeaders = getAuthHeaders(adminResult.tokens);

      const custResult = await registerAndLogin(app, `cust${Date.now()}@test.com`, 'customer');
      const customerHeaders = getAuthHeaders(custResult.tokens);

      let restaurant = await createRestaurant(app, restResult.user.id, restHeaders);
      restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

      let menu = await createMenu(app, restaurant.id, restHeaders);
      menu = await publishMenu(app, menu.id, restHeaders);

      // Customer creates order
      const order = await createOrder(app, custResult.user.id, customerHeaders, {
        restaurantId: restaurant.id,
        menuId: menu.id,
        items: [{ itemName: 'Item', quantity: 1, price: 100 }],
        deliveryAddress: '123 Ave',
      });

      expect(order.status).toBe('pending');

      // Customer cancels
      const cancelResp = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(customerHeaders)
        .send({ reason: 'Found better offer' });

      expect(cancelResp.status).toBe(200);
      expect(cancelResp.body.data.status).toBe('cancelled');

      // Verify cancelled order shows up in order list
      const listResp = await request(app)
        .get('/api/orders')
        .set(customerHeaders);

      const cancelledOrder = listResp.body.data.find(o => o.id === order.id);
      expect(cancelledOrder.status).toBe('cancelled');
    });
  });

  // ============== RESTAURANT REJECTION FLOW ==============

  describe('Restaurant Rejection and Re-approval', () => {
    test('rejected restaurant can be re-approved and operate', async () => {
      const restResult = await registerAndLogin(app, `rest${Date.now()}@test.com`, 'restaurant_admin');
      const restHeaders = getAuthHeaders(restResult.tokens);

      const adminResult = await registerAndLogin(app, `admin${Date.now()}@test.com`, 'system_admin');
      const adminHeaders = getAuthHeaders(adminResult.tokens);

      // Create restaurant
      let restaurant = await createRestaurant(app, restResult.user.id, restHeaders, {
        name: 'Initially Rejected Restaurant',
        email: `rej${Date.now()}@test.com`,
      });

      expect(restaurant.verificationStatus).toBe('pending');

      // Admin rejects
      const rejectedResp = await request(app)
        .put(`/api/restaurants/admin/${restaurant.id}/reject`)
        .set(adminHeaders)
        .send({ notes: 'Documents incomplete' });

      expect(rejectedResp.status).toBe(200);
      expect(rejectedResp.body.data.verificationStatus).toBe('rejected');

      // Admin re-approves
      const reapprovResp = await request(app)
        .put(`/api/restaurants/admin/${restaurant.id}/approve`)
        .set(adminHeaders)
        .send({});

      expect(reapprovResp.status).toBe(200);
      expect(reapprovResp.body.data.verificationStatus).toBe('verified');
      expect(reapprovResp.body.data.isApproved).toBe(true);

      // Restaurant can now create and publish menus
      const menu = await createMenu(app, restaurant.id, restHeaders, {
        name: 'Comeback Menu',
      });

      const publishedMenu = await publishMenu(app, menu.id, restHeaders);
      expect(publishedMenu.status).toBe('published');
    });
  });
});
