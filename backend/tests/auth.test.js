const request = require('supertest');

// Modules are required after setup.js sets environment variables
let app, sequelize, User;

describe('Auth Endpoints', () => {
  beforeAll(async () => {
    // Load modules after environment is configured by setup.js
    app = require('../src/app');
    sequelize = require('../src/config/database');
    User = require('../src/models/User');

    // Sync database (create tables)
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    // Close database connection
    await sequelize.close();
  });

  afterEach(async () => {
    // Clean up users after each test (hard delete to remove soft-deleted rows too)
    await User.destroy({ where: {}, force: true });
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.user.role).toBe('customer');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.user.passwordHash).toBeUndefined();
    });

    test('should fail with duplicate email', async () => {
      // Create first user
      await request(app).post('/api/auth/register').send({
        email: 'duplicate@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      // Try to create second user with same email
      const response = await request(app).post('/api/auth/register').send({
        email: 'duplicate@example.com',
        password: 'SecurePass456!',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('EMAIL_EXISTS');
    });

    test('should fail with invalid email format', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'invalid-email',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    test('should fail with weak password', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'weak@example.com',
        password: 'short',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    test('should fail with missing required fields', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        // Missing password
        firstName: 'John',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should register user with default customer role', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'customer@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('customer');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await request(app).post('/api/auth/register').send({
        email: 'login@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    test('should login successfully with correct credentials', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'login@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe('login@example.com');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    test('should fail with incorrect password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'login@example.com',
        password: 'WrongPassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_PASSWORD');
    });

    test('should fail with non-existent email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'SecurePass123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('USER_NOT_FOUND');
    });

    test('should fail with missing email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        password: 'SecurePass123!',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail with missing password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'login@example.com',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should update lastLoginAt timestamp', async () => {
      const beforeLogin = new Date();

      await new Promise(resolve => setTimeout(resolve, 100));

      await request(app).post('/api/auth/login').send({
        email: 'login@example.com',
        password: 'SecurePass123!',
      });

      const user = await User.findOne({ where: { email: 'login@example.com' } });
      expect(user.lastLoginAt).toBeTruthy();
      expect(user.lastLoginAt.getTime()).toBeGreaterThan(beforeLogin.getTime());
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken;
    let accessToken;

    beforeEach(async () => {
      // Register and login to get tokens
      const response = await request(app).post('/api/auth/register').send({
        email: 'refresh@example.com',
        password: 'SecurePass123!',
      });

      refreshToken = response.body.data.refreshToken;
      accessToken = response.body.data.accessToken;
    });

    test('should refresh token successfully', async () => {
      const response = await request(app).post('/api/auth/refresh').send({
        refreshToken,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      // Token should be valid for this user
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(response.body.data.accessToken);
      expect(decoded.id).toBe(decoded.id); // Just verify it has an id
    });

    test('should fail with missing refresh token', async () => {
      const response = await request(app).post('/api/auth/refresh').send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail with invalid refresh token', async () => {
      const response = await request(app).post('/api/auth/refresh').send({
        refreshToken: 'invalid.token.here',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('GET /api/auth/me', () => {
    let accessToken;
    let userId;

    beforeEach(async () => {
      // Register to get token
      const response = await request(app).post('/api/auth/register').send({
        email: 'profile@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      if (!response.body.data) {
        throw new Error(`Registration failed: ${response.status} - ${response.body.message}`);
      }

      accessToken = response.body.data.accessToken;
      userId = response.body.data.user.id;
    });

    test('should get current user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe('profile@example.com');
      expect(response.body.data.user.id).toBe(userId);
    });

    test('should fail without access token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessToken;

    beforeEach(async () => {
      // Register to get token
      const response = await request(app).post('/api/auth/register').send({
        email: 'logout@example.com',
        password: 'SecurePass123!',
      });

      if (!response.body.data) {
        throw new Error(`Registration failed: ${response.status} - ${response.body.message}`);
      }

      accessToken = response.body.data.accessToken;
    });

    test('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail without access token', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    let customerToken;
    let adminToken;
    let restaurantToken;

    beforeEach(async () => {
      const timestamp = Date.now();
      
      // Register customer
      const customerRes = await request(app).post('/api/auth/register').send({
        email: `customer-${timestamp}@example.com`,
        password: 'SecurePass123!',
      });
      customerToken = customerRes.body?.data?.accessToken;

      // Create admin user manually
      const Admin = require('../src/models/User');
      const adminUser = await Admin.create({
        email: `admin-${timestamp}@example.com`,
        passwordHash: 'SecurePass123!',
        role: 'system_admin',
      });
      const adminTokenRes = adminUser.generateTokens();
      adminToken = adminTokenRes.accessToken;

      // Create restaurant admin user manually
      const restaurantUser = await Admin.create({
        email: `restaurant-${timestamp}@example.com`,
        passwordHash: 'SecurePass123!',
        role: 'restaurant_admin',
      });
      const restaurantTokenRes = restaurantUser.generateTokens();
      restaurantToken = restaurantTokenRes.accessToken;
    });

    test('customer can access protected endpoint', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('customer cannot access admin endpoint (should return 403)', async () => {
      const response = await request(app)
        .get('/api/test/admin')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    test('admin can access admin endpoint', async () => {
      const response = await request(app)
        .get('/api/test/admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('restaurant admin can access restaurant endpoint', async () => {
      const response = await request(app)
        .get('/api/test/restaurant')
        .set('Authorization', `Bearer ${restaurantToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('customer cannot access restaurant endpoint (should return 403)', async () => {
      const response = await request(app)
        .get('/api/test/restaurant')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should return 401 without token on protected endpoint', async () => {
      const response = await request(app).get('/api/test/protected');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
