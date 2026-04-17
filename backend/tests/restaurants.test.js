const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createUserWithRole,
  createRestaurant,
  getRestaurant,
  approveRestaurant,
  rejectRestaurant,
  updateDeliverySettings,
  cleanupAllData,
} = require('./helpers');

// Modules are required after setup.js sets environment variables
let app, sequelize, models;
let customer, restaurantAdmin, systemAdmin;
let customerHeaders, restaurantAdminHeaders, adminHeaders;

describe('Restaurant Management API', () => {
  beforeAll(async () => {
    // Load modules after environment is configured by setup.js
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');

    // Sync database (create tables)
    await sequelize.sync({ force: true });

    // Create test users with different roles
    const customerResult = await registerAndLogin(app, 'customer@test.com', 'customer');
    customer = customerResult.user;
    customerHeaders = getAuthHeaders(customerResult.tokens);

    const adminResult = await registerAndLogin(app, 'admin@test.com', 'system_admin');
    systemAdmin = adminResult.user;
    adminHeaders = getAuthHeaders(adminResult.tokens);

    const restaurantResult = await registerAndLogin(app, 'restaurant@test.com', 'restaurant_admin');
    restaurantAdmin = restaurantResult.user;
    restaurantAdminHeaders = getAuthHeaders(restaurantResult.tokens);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  afterEach(async () => {
    // Clean restaurants after each test (keep users for auth)
    await models.Order?.destroy({ where: {}, force: true });
    await models.DeliverySlot?.destroy({ where: {}, force: true });
    await models.Menu?.destroy({ where: {}, force: true });
    await models.Restaurant?.destroy({ where: {}, force: true });
  });

  // ============== RESTAURANT CREATION TESTS ==============

  describe('POST /api/restaurants - Create Restaurant', () => {
    test('should create a restaurant successfully with valid data', async () => {
      const restaurantData = {
        name: 'Test Restaurant',
        email: `restaurant${Date.now()}@test.com`,
        phone: '9876543210',
        description: 'Great food delivered fast',
        address: '123 Main St',
        city: 'Test City',
        zipCode: '12345',
      };

      const response = await request(app)
        .post('/api/restaurants')
        .set(restaurantAdminHeaders)
        .send(restaurantData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(restaurantData.name);
      expect(response.body.data.ownerId).toBe(restaurantAdmin.id);
      expect(response.body.data.verificationStatus).toBe('pending');
      expect(response.body.data.isApproved).toBe(false);
    });

    test('should reject restaurant creation with missing required fields', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .set(restaurantAdminHeaders)
        .send({
          email: 'restaurant@test.com',
          // Missing name, phone, etc.
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    test('should reject restaurant creation with duplicate email', async () => {
      const restaurantData = {
        name: 'Restaurant 1',
        email: 'duplicate@test.com',
        phone: '9876543210',
        description: 'Restaurant',
        address: '123 Main St',
        city: 'Test City',
        zipCode: '12345',
      };

      // Create first restaurant
      await request(app)
        .post('/api/restaurants')
        .set(restaurantAdminHeaders)
        .send(restaurantData);

      // Try to create second with same email
      const response = await request(app)
        .post('/api/restaurants')
        .set(restaurantAdminHeaders)
        .send(restaurantData);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('already registered');
    });

    test('should reject restaurant creation with invalid email format', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .set(restaurantAdminHeaders)
        .send({
          name: 'Test Restaurant',
          email: 'invalid-email',
          phone: '9876543210',
          description: 'Restaurant',
          address: '123 Main St',
          city: 'Test City',
          zipCode: '12345',
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should reject restaurant creation when not authenticated', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .send({
          name: 'Test Restaurant',
          email: 'test@test.com',
          phone: '9876543210',
          description: 'Restaurant',
          address: '123 Main St',
          city: 'Test City',
          zipCode: '12345',
        });

      expect(response.status).toBe(401);
    });
  });

  // ============== RESTAURANT RETRIEVAL TESTS ==============

  describe('GET /api/restaurants/:id - Get Restaurant', () => {
    let restaurant;

    beforeEach(async () => {
      restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders);
    });

    test('should retrieve restaurant successfully', async () => {
      const response = await request(app)
        .get(`/api/restaurants/${restaurant.id}`)
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(restaurant.id);
      expect(response.body.data.name).toBe(restaurant.name);
    });

    test('should return 404 for non-existent restaurant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/restaurants/${fakeId}`)
        .set(customerHeaders);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('not found');
    });

    test('should allow unauthenticated access to public restaurant info', async () => {
      const response = await request(app).get(`/api/restaurants/${restaurant.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe(restaurant.name);
    });
  });

  // ============== RESTAURANT LIST TESTS ==============

  describe('GET /api/restaurants - List Restaurants', () => {
    test('should list all restaurants', async () => {
      // Create 2 restaurants
      await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        name: 'Restaurant 1',
        email: `rest1${Date.now()}@test.com`,
      });

      const result = await registerAndLogin(app, `rest2owner${Date.now()}@test.com`, 'restaurant_admin');
      await createRestaurant(app, result.user.id, getAuthHeaders(result.tokens), {
        name: 'Restaurant 2',
        email: `rest2${Date.now()}@test.com`,
      });

      const response = await request(app).get('/api/restaurants').set(customerHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    test('should support pagination in restaurant list', async () => {
      const response = await request(app)
        .get('/api/restaurants?limit=5&offset=0')
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  // ============== RESTAURANT UPDATE TESTS ==============

  describe('PUT /api/restaurants/:id - Update Restaurant', () => {
    let restaurant;

    beforeEach(async () => {
      restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders);
    });

    test('should allow owner to update restaurant details', async () => {
      const response = await request(app)
        .put(`/api/restaurants/${restaurant.id}`)
        .set(restaurantAdminHeaders)
        .send({
          description: 'Updated description',
          phone: '1234567890',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.description).toBe('Updated description');
      expect(response.body.data.phone).toBe('1234567890');
    });

    test('should prevent non-owner from updating restaurant', async () => {
      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .put(`/api/restaurants/${restaurant.id}`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({
          description: 'Hacked description',
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('do not own');
    });

    test('should prevent customer from updating any restaurant', async () => {
      const response = await request(app)
        .put(`/api/restaurants/${restaurant.id}`)
        .set(customerHeaders)
        .send({
          description: 'Hacked description',
        });

      expect(response.status).toBe(403);
    });

    test('should return 404 when updating non-existent restaurant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .put(`/api/restaurants/${fakeId}`)
        .set(restaurantAdminHeaders)
        .send({
          description: 'Updated',
        });

      expect(response.status).toBe(404);
    });
  });

  // ============== RESTAURANT APPROVAL TESTS ==============

  describe('PUT /api/restaurants/admin/:id/approve - Approve Restaurant', () => {
    let restaurant;

    beforeEach(async () => {
      restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders);
    });

    test('should allow system admin to approve restaurant', async () => {
      const response = await request(app)
        .put(`/api/restaurants/admin/${restaurant.id}/approve`)
        .set(adminHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.isApproved).toBe(true);
      expect(response.body.data.verificationStatus).toBe('verified');
      expect(response.body.data.approvedAt).toBeDefined();
      expect(response.body.data.approvedBy).toBe(systemAdmin.id);
    });

    test('should prevent non-admin from approving restaurant', async () => {
      const response = await request(app)
        .put(`/api/restaurants/admin/${restaurant.id}/approve`)
        .set(restaurantAdminHeaders)
        .send({});

      expect(response.status).toBe(403);
    });

    test('should prevent customer from approving restaurant', async () => {
      const response = await request(app)
        .put(`/api/restaurants/admin/${restaurant.id}/approve`)
        .set(customerHeaders)
        .send({});

      expect(response.status).toBe(403);
    });

    test('should return 404 when approving non-existent restaurant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .put(`/api/restaurants/admin/${fakeId}/approve`)
        .set(adminHeaders)
        .send({});

      expect(response.status).toBe(404);
    });
  });

  // ============== RESTAURANT REJECTION TESTS ==============

  describe('PUT /api/restaurants/admin/:id/reject - Reject Restaurant', () => {
    let restaurant;

    beforeEach(async () => {
      restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders);
    });

    test('should allow system admin to reject restaurant', async () => {
      const response = await request(app)
        .put(`/api/restaurants/admin/${restaurant.id}/reject`)
        .set(adminHeaders)
        .send({
          notes: 'Documents not verified',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.isApproved).toBe(false);
      expect(response.body.data.verificationStatus).toBe('rejected');
      expect(response.body.data.verificationNotes).toContain('Documents not verified');
    });

    test('should prevent non-admin from rejecting restaurant', async () => {
      const response = await request(app)
        .put(`/api/restaurants/admin/${restaurant.id}/reject`)
        .set(restaurantAdminHeaders)
        .send({
          notes: 'Not authorized',
        });

      expect(response.status).toBe(403);
    });

    test('should store rejection reason in verification notes', async () => {
      const notes = 'Health inspection failed';

      const response = await request(app)
        .put(`/api/restaurants/admin/${restaurant.id}/reject`)
        .set(adminHeaders)
        .send({ notes });

      expect(response.status).toBe(200);
      expect(response.body.data.verificationNotes).toContain(notes);
    });
  });

  // ============== DELIVERY SETTINGS TESTS ==============

  describe('PUT /api/restaurants/:id/delivery-settings - Update Delivery Settings', () => {
    let restaurant;

    beforeEach(async () => {
      restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders);
    });

    test('should allow owner to update delivery settings', async () => {
      const response = await request(app)
        .put(`/api/restaurants/${restaurant.id}/delivery-settings`)
        .set(restaurantAdminHeaders)
        .send({
          deliveryEnabled: true,
          pickupEnabled: false,
          defaultDeliveryFee: 50,
          minOrderForDelivery: 100,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.deliveryEnabled).toBe(true);
      expect(response.body.data.pickupEnabled).toBe(false);
      expect(response.body.data.defaultDeliveryFee).toBe(50);
      expect(response.body.data.minOrderForDelivery).toBe(100);
    });

    test('should prevent non-owner from updating delivery settings', async () => {
      const otherOwner = await registerAndLogin(app, `other${Date.now()}@test.com`, 'restaurant_admin');

      const response = await request(app)
        .put(`/api/restaurants/${restaurant.id}/delivery-settings`)
        .set(getAuthHeaders(otherOwner.tokens))
        .send({
          deliveryEnabled: false,
        });

      expect(response.status).toBe(403);
    });

    test('should validate delivery fee is non-negative', async () => {
      const response = await request(app)
        .put(`/api/restaurants/${restaurant.id}/delivery-settings`)
        .set(restaurantAdminHeaders)
        .send({
          defaultDeliveryFee: -50,
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    test('should return 404 when updating settings for non-existent restaurant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .put(`/api/restaurants/${fakeId}/delivery-settings`)
        .set(restaurantAdminHeaders)
        .send({
          deliveryEnabled: true,
        });

      expect(response.status).toBe(404);
    });
  });

  // ============== RESTAURANT WORKFLOW TESTS ==============

  describe('Restaurant Approval Workflow', () => {
    test('should complete full restaurant registration and approval workflow', async () => {
      // 1. Create restaurant (pending)
      const restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        name: 'New Restaurant',
        email: `workflow${Date.now()}@test.com`,
      });

      expect(restaurant.verificationStatus).toBe('pending');
      expect(restaurant.isApproved).toBe(false);

      // 2. Admin approves restaurant (verified)
      const approvedRestaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

      expect(approvedRestaurant.verificationStatus).toBe('verified');
      expect(approvedRestaurant.isApproved).toBe(true);

      // 3. Verified restaurant shows up in public listings as approved
      const retrievedRestaurant = await getRestaurant(app, restaurant.id);

      expect(retrievedRestaurant.isApproved).toBe(true);
    });

    test('should support rejection workflow', async () => {
      const restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        email: `rejection${Date.now()}@test.com`,
      });

      // Admin rejects
      const rejectedRestaurant = await rejectRestaurant(app, restaurant.id, adminHeaders, {
        notes: 'License expired',
      });

      expect(rejectedRestaurant.verificationStatus).toBe('rejected');
      expect(rejectedRestaurant.isApproved).toBe(false);
      expect(rejectedRestaurant.verificationNotes).toContain('License expired');
    });

    test('should support re-approval after rejection', async () => {
      const restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders, {
        email: `reapproval${Date.now()}@test.com`,
      });

      // Reject
      await rejectRestaurant(app, restaurant.id, adminHeaders);

      // Re-approve
      const reapprovedRestaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

      expect(reapprovedRestaurant.verificationStatus).toBe('verified');
      expect(reapprovedRestaurant.isApproved).toBe(true);
    });
  });

  // ============== AUTHENTICATION TESTS ==============

  describe('Authentication & Authorization', () => {
    test('should reject requests without authentication token', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .send({
          name: 'Test',
          email: 'test@test.com',
          phone: '1234567890',
          description: 'Test',
          address: '123 Main',
          city: 'City',
          zipCode: '12345',
        });

      expect(response.status).toBe(401);
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          name: 'Test',
          email: 'test@test.com',
          phone: '1234567890',
          description: 'Test',
          address: '123 Main',
          city: 'City',
          zipCode: '12345',
        });

      expect(response.status).toBe(401);
    });

    test('should reject requests with expired token', async () => {
      const response = await request(app)
        .post('/api/restaurants')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjB9.invalid')
        .send({
          name: 'Test',
          email: 'test@test.com',
          phone: '1234567890',
          description: 'Test',
          address: '123 Main',
          city: 'City',
          zipCode: '12345',
        });

      expect(response.status).toBe(401);
    });
  });
});
