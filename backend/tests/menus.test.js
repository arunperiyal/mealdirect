const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  createMenu,
  publishMenu,
  addDeliverySlots,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;
let restaurantAdmin, systemAdmin;
let restaurantAdminHeaders, adminHeaders;
let approvedRestaurant;

describe('Menu Management API', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');

    await sequelize.sync({ force: true });

    const adminResult = await registerAndLogin(app, 'admin@test.com', 'system_admin');
    systemAdmin = adminResult.user;
    adminHeaders = getAuthHeaders(adminResult.tokens);

    const restaurantResult = await registerAndLogin(app, 'restaurant@test.com', 'restaurant_admin');
    restaurantAdmin = restaurantResult.user;
    restaurantAdminHeaders = getAuthHeaders(restaurantResult.tokens);

    approvedRestaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders);
    approvedRestaurant = await approveRestaurant(app, approvedRestaurant.id, adminHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  afterEach(async () => {
    await models.Order?.destroy({ where: {}, force: true });
    await models.DeliverySlot?.destroy({ where: {}, force: true });
    await models.Menu?.destroy({ where: {}, force: true });
  });

  // ============== MENU CREATION TESTS ==============

  describe('POST /api/menus - Create Menu', () => {
    test('should create menu successfully for approved restaurant', async () => {
      const menuData = {
        date: new Date().toISOString().split('T')[0],
        items: [
          { name: 'Biryani', description: 'Hyderabadi', price: 200, quantity: 20 },
          { name: 'Curry', description: 'Chicken curry', price: 150, quantity: 30 },
        ],
      };

      const response = await request(app)
        .post('/api/menus')
        .set(restaurantAdminHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          ...menuData,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.date).toBe(menuData.date);
      expect(response.body.data.status).toBe('draft');
      expect(Array.isArray(response.body.data.items)).toBe(true);
    });

    test('should reject menu creation for unapproved restaurant', async () => {
      const unapprovedRest = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        email: `unappr${Date.now()}@test.com`,
      });

      const response = await request(app)
        .post('/api/menus')
        .set(restaurantAdminHeaders)
        .send({
          restaurantId: unapprovedRest.id,
          name: 'Menu',
          items: [{ name: 'Item', price: 100 }],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('not approved');
    });

    test('should reject without authentication', async () => {
      const response = await request(app)
        .post('/api/menus')
        .send({
          restaurantId: approvedRestaurant.id,
          name: 'Menu',
        });

      expect(response.status).toBe(401);
    });
  });

  // ============== MENU RETRIEVAL & LIST ==============

  describe('GET /api/menus/:id - Get Menu', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should retrieve menu by id', async () => {
      const response = await request(app).get(`/api/menus/${menu.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(menu.id);
      expect(response.body.data.name).toBe(menu.name);
    });

    test('should return 404 for non-existent menu', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app).get(`/api/menus/${fakeId}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/menus - List Menus', () => {
    beforeEach(async () => {
      await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
      await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should list all menus', async () => {
      const response = await request(app).get('/api/menus');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============== MENU UPDATE ==============

  describe('PUT /api/menus/:id - Update Menu', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should allow owner to update menu', async () => {
      const response = await request(app)
        .put(`/api/menus/${menu.id}`)
        .set(restaurantAdminHeaders)
        .send({
          description: 'Updated menu',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.description).toBe('Updated menu');
    });

    test('should prevent non-owner from updating', async () => {
      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .put(`/api/menus/${menu.id}`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({ description: 'Hacked' });

      expect(response.status).toBe(403);
    });

    test('should return 404 for non-existent menu', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .put(`/api/menus/${fakeId}`)
        .set(restaurantAdminHeaders)
        .send({ description: 'Update' });

      expect(response.status).toBe(404);
    });
  });

  // ============== MENU STATUS WORKFLOW ==============

  describe('POST /api/menus/:id/publish - Publish Menu', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should allow owner to publish draft menu', async () => {
      const response = await request(app)
        .post(`/api/menus/${menu.id}/publish`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('published');
    });

    test('should prevent publishing already published menu', async () => {
      await publishMenu(app, menu.id, restaurantAdminHeaders);

      const response = await request(app)
        .post(`/api/menus/${menu.id}/publish`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(400);
    });

    test('should prevent non-owner from publishing', async () => {
      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .post(`/api/menus/${menu.id}/publish`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({});

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/menus/:id/close - Close Menu', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
      await publishMenu(app, menu.id, restaurantAdminHeaders);
    });

    test('should allow owner to close published menu', async () => {
      const response = await request(app)
        .post(`/api/menus/${menu.id}/close`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('closed');
    });

    test('should prevent closing already closed menu', async () => {
      await request(app)
        .post(`/api/menus/${menu.id}/close`)
        .set(restaurantAdminHeaders)
        .send({});

      const response = await request(app)
        .post(`/api/menus/${menu.id}/close`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  // ============== MENU ITEMS ==============

  describe('POST /api/menus/:id/items - Add Menu Items', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders, { items: [] });
    });

    test('should add items to menu', async () => {
      const items = [
        { name: 'Biryani', price: 200, quantity: 20 },
        { name: 'Curry', price: 150, quantity: 30 },
      ];

      const response = await request(app)
        .post(`/api/menus/${menu.id}/items`)
        .set(restaurantAdminHeaders)
        .send({ items });

      expect(response.status).toBe(201);
      expect(response.body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    test('should prevent non-owner from adding items', async () => {
      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .post(`/api/menus/${menu.id}/items`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({ items: [{ name: 'Item', price: 100 }] });

      expect(response.status).toBe(403);
    });
  });

  // ============== DELIVERY SLOTS ==============

  describe('POST /api/menus/:id/slots - Add Delivery Slots', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should add delivery slots to menu', async () => {
      const slots = await addDeliverySlots(app, menu.id, approvedRestaurant.id, restaurantAdminHeaders);

      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThanOrEqual(3);
    });

    test('should prevent non-owner from adding slots', async () => {
      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .post(`/api/menus/${menu.id}/slots`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({
          restaurantId: approvedRestaurant.id,
          startTime: '18:00',
          endTime: '18:30',
          maxOrders: 20,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/menus/:id/slots - List Delivery Slots', () => {
    let menu, slots;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
      slots = await addDeliverySlots(app, menu.id, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should list all slots for a menu', async () => {
      const response = await request(app).get(`/api/menus/${menu.id}/slots`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ============== MENU WORKFLOW ==============

  describe('Complete Menu Workflow', () => {
    test('should complete full menu creation, slot addition, and publishing', async () => {
      // 1. Create menu (draft)
      const menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders, {
        name: 'Complete Menu',
      });
      expect(menu.status).toBe('draft');

      // 2. Add delivery slots
      const slots = await addDeliverySlots(app, menu.id, approvedRestaurant.id, restaurantAdminHeaders);
      expect(slots.length).toBeGreaterThanOrEqual(3);

      // 3. Publish menu
      const publishedMenu = await publishMenu(app, menu.id, restaurantAdminHeaders);
      expect(publishedMenu.status).toBe('published');

      // 4. Verify customers can see published menu
      const retrieved = await request(app).get(`/api/menus/${menu.id}`);
      expect(retrieved.status).toBe(200);
      expect(retrieved.body.data.status).toBe('published');
    });
  });
});
