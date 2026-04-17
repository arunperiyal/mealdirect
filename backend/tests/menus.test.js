const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createUserWithRole,
  createRestaurant,
  approveRestaurant,
  createMenu,
  publishMenu,
  addDeliverySlots,
  setupCompleteMenu,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;
let customer, restaurantAdmin, systemAdmin;
let customerHeaders, restaurantAdminHeaders, adminHeaders;
let approvedRestaurant, restaurantAdminHeaders2;

describe('Menu Management API', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');

    await sequelize.sync({ force: true });

    const customerResult = await registerAndLogin(app, 'customer@test.com', 'customer');
    customer = customerResult.user;
    customerHeaders = getAuthHeaders(customerResult.tokens);

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
    test('should create menu successfully with valid data for approved restaurant', async () => {
      const menuData = {
        name: 'Daily Menu',
        description: 'Today special',
        date: new Date().toISOString().split('T')[0],
        items: [
          { name: 'Biryani', description: 'Hyderabadi', price: 200, quantity: 20 },
          { name: 'Curry', description: 'Chicken curry', price: 150, quantity: 30 },
        ],
        maxOrdersPerSlot: 15,
      };

      const response = await request(app)
        .post('/api/menus')
        .set(restaurantAdminHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          ...menuData,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.name).toBe(menuData.name);
      expect(response.body.data.status).toBe('draft');
      expect(Array.isArray(response.body.data.items)).toBe(true);
    });

    test('should reject menu creation for unapproved restaurant', async () => {
      const unapprovedRestaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        email: `unapproved${Date.now()}@test.com`,
      });

      const response = await request(app)
        .post('/api/menus')
        .set(restaurantAdminHeaders)
        .send({
          restaurantId: unapprovedRestaurant.id,
          name: 'Menu',
          items: [{ name: 'Item', price: 100 }],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('not approved');
    });

    test('should reject menu creation without authentication', async () => {
      const response = await request(app)
        .post('/api/menus')
        .send({
          restaurantId: approvedRestaurant.id,
          name: 'Menu',
        });

      expect(response.status).toBe(401);
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/menus')
        .set(restaurantAdminHeaders)
        .send({
          restaurantId: approvedRestaurant.id,
          // Missing name and items
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  // ============== MENU RETRIEVAL TESTS ==============

  describe('GET /api/menus/:id - Get Menu', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should retrieve menu by id', async () => {
      const response = await request(app)
        .get(`/api/menus/${menu.id}`)
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(menu.id);
      expect(response.body.data.name).toBe(menu.name);
    });

    test('should return 404 for non-existent menu', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/menus/${fakeId}`)
        .set(customerHeaders);

      expect(response.status).toBe(404);
    });

    test('should allow unauthenticated access', async () => {
      const response = await request(app).get(`/api/menus/${menu.id}`);

      expect(response.status).toBe(200);
    });
  });

  // ============== MENU LIST TESTS ==============

  describe('GET /api/menus - List Menus', () => {
    beforeEach(async () => {
      await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders, {
        name: 'Menu 1',
      });
      await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders, {
        name: 'Menu 2',
      });
    });

    test('should list all menus with pagination', async () => {
      const response = await request(app)
        .get('/api/menus')
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    test('should filter menus by restaurant', async () => {
      const response = await request(app)
        .get(`/api/menus?restaurantId=${approvedRestaurant.id}`)
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should filter menus by status', async () => {
      const menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
      await publishMenu(app, menu.id, restaurantAdminHeaders);

      const response = await request(app)
        .get('/api/menus?status=published')
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  // ============== MENU UPDATE TESTS ==============

  describe('PUT /api/menus/:id - Update Menu', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should allow owner to update menu details', async () => {
      const response = await request(app)
        .put(`/api/menus/${menu.id}`)
        .set(restaurantAdminHeaders)
        .send({
          description: 'Updated menu',
          name: 'New Menu Name',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.description).toBe('Updated menu');
      expect(response.body.data.name).toBe('New Menu Name');
    });

    test('should prevent non-owner from updating menu', async () => {
      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .put(`/api/menus/${menu.id}`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({
          description: 'Hacked',
        });

      expect(response.status).toBe(403);
    });

    test('should prevent customer from updating menu', async () => {
      const response = await request(app)
        .put(`/api/menus/${menu.id}`)
        .set(customerHeaders)
        .send({
          description: 'Hacked',
        });

      expect(response.status).toBe(403);
    });

    test('should return 404 for non-existent menu', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .put(`/api/menus/${fakeId}`)
        .set(restaurantAdminHeaders)
        .send({
          description: 'Update',
        });

      expect(response.status).toBe(404);
    });
  });

  // ============== MENU STATUS WORKFLOW TESTS ==============

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
      expect(response.body.message).toContain('cannot');
    });

    test('should prevent non-owner from publishing menu', async () => {
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

  // ============== MENU ITEMS TESTS ==============

  describe('POST /api/menus/:id/items - Add Menu Items', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders, {
        items: [],
      });
    });

    test('should add items to menu', async () => {
      const items = [
        { name: 'Biryani', description: 'Hyderabadi', price: 200, quantity: 20 },
        { name: 'Curry', description: 'Chicken curry', price: 150, quantity: 30 },
      ];

      const response = await request(app)
        .post(`/api/menus/${menu.id}/items`)
        .set(restaurantAdminHeaders)
        .send({ items });

      expect(response.status).toBe(201);
      expect(response.body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    test('should prevent adding items to non-existent menu', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .post(`/api/menus/${fakeId}/items`)
        .set(restaurantAdminHeaders)
        .send({
          items: [{ name: 'Item', price: 100 }],
        });

      expect(response.status).toBe(404);
    });

    test('should validate item data', async () => {
      const response = await request(app)
        .post(`/api/menus/${menu.id}/items`)
        .set(restaurantAdminHeaders)
        .send({
          items: [{ name: '', price: -100 }], // Invalid
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('PUT /api/menus/:id/items/:itemId - Update Menu Item', () => {
    let menu, itemId;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
      if (menu.items && menu.items.length > 0) {
        itemId = menu.items[0].id;
      }
    });

    test('should update item details', async () => {
      if (!itemId) this.skip();

      const response = await request(app)
        .put(`/api/menus/${menu.id}/items/${itemId}`)
        .set(restaurantAdminHeaders)
        .send({
          price: 250,
          quantity: 15,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.price).toBe(250);
    });

    test('should prevent non-owner from updating items', async () => {
      if (!itemId) this.skip();

      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .put(`/api/menus/${menu.id}/items/${itemId}`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({
          price: 100,
        });

      expect(response.status).toBe(403);
    });
  });

  // ============== DELIVERY SLOTS TESTS ==============

  describe('POST /api/menus/:id/slots - Add Delivery Slots', () => {
    let menu;

    beforeEach(async () => {
      menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
    });

    test('should add delivery slots to menu', async () => {
      const slots = [
        { time: '18:00', capacity: 20 },
        { time: '18:30', capacity: 20 },
      ];

      const response = await request(app)
        .post(`/api/menus/${menu.id}/slots`)
        .set(restaurantAdminHeaders)
        .send({ slots });

      expect(response.status).toBe(201);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    test('should validate slot capacity is positive', async () => {
      const response = await request(app)
        .post(`/api/menus/${menu.id}/slots`)
        .set(restaurantAdminHeaders)
        .send({
          slots: [{ time: '18:00', capacity: -10 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should validate slot time format', async () => {
      const response = await request(app)
        .post(`/api/menus/${menu.id}/slots`)
        .set(restaurantAdminHeaders)
        .send({
          slots: [{ time: 'invalid', capacity: 10 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/menus/:id/slots - List Delivery Slots', () => {
    let menu;

    beforeEach(async () => {
      const result = await setupCompleteMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
      menu = result.menu;
    });

    test('should list all slots for a menu', async () => {
      const response = await request(app)
        .get(`/api/menus/${menu.id}/slots`)
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should return 404 for non-existent menu', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/menus/${fakeId}/slots`)
        .set(customerHeaders);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/slots/:id - Delete Delivery Slot', () => {
    let menu, slotId;

    beforeEach(async () => {
      const result = await setupCompleteMenu(app, approvedRestaurant.id, restaurantAdminHeaders);
      menu = result.menu;
      if (result.slots && result.slots.length > 0) {
        slotId = result.slots[0].id;
      }
    });

    test('should delete delivery slot', async () => {
      if (!slotId) this.skip();

      const response = await request(app)
        .delete(`/api/menus/${menu.id}/slots/${slotId}`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(200);
    });

    test('should prevent non-owner from deleting slot', async () => {
      if (!slotId) this.skip();

      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .delete(`/api/menus/${menu.id}/slots/${slotId}`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({});

      expect(response.status).toBe(403);
    });
  });

  // ============== MENU WORKFLOW TESTS ==============

  describe('Complete Menu Workflow', () => {
    test('should complete full menu creation and publishing workflow', async () => {
      // 1. Create menu (draft)
      const menu = await createMenu(app, approvedRestaurant.id, restaurantAdminHeaders, {
        name: 'Complete Menu',
        items: [{ name: 'Item 1', price: 100 }],
      });

      expect(menu.status).toBe('draft');

      // 2. Add delivery slots
      const slots = await addDeliverySlots(app, menu.id, restaurantAdminHeaders);
      expect(Array.isArray(slots)).toBe(true);

      // 3. Publish menu
      const publishedMenu = await publishMenu(app, menu.id, restaurantAdminHeaders);
      expect(publishedMenu.status).toBe('published');

      // 4. Verify customers can see published menu
      const retrieved = await request(app)
        .get(`/api/menus/${menu.id}`)
        .set(customerHeaders);

      expect(retrieved.status).toBe(200);
      expect(retrieved.body.data.status).toBe('published');
    });
  });
});
