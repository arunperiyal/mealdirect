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
let adminHeaders, customerHeaders, otherCustomerHeaders, ownerHeaders;
let approved, pending, rejected, menu;

describe('System admin API', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'sa-admin@test.com', 'system_admin')).tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'sa-cust@test.com', 'customer')).tokens);
    otherCustomerHeaders = getAuthHeaders((await registerAndLogin(app, 'sa-cust2@test.com', 'customer')).tokens);
    const owner = await registerAndLogin(app, 'sa-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);

    approved = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Amma Mess', email: 'amma@test.com' });
    approved = await approveRestaurant(app, approved.id, adminHeaders);
    pending = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Pending Kitchen', email: 'pend@test.com' });
    rejected = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Rejected Diner', email: 'rej@test.com' });
    await request(app)
      .put(`/api/restaurants/admin/${rejected.id}/reject`)
      .set(adminHeaders)
      .send({ notes: 'FSSAI licence missing' });

    menu = await createMenu(app, approved.id, ownerHeaders);
    menu = await publishMenu(app, menu.id, ownerHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const order = (headers, quantity = 1) =>
    request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        restaurantId: approved.id,
        menuId: menu.id,
        items: [{ menuItemId: menu.items[0].id, quantity }],
        deliveryType: 'pickup',
        paymentMethod: 'cod',
      })
      .then((r) => r.body.data);

  describe('public restaurant endpoints', () => {
    test('list only approved restaurants, whatever the query says', async () => {
      for (const url of ['/api/restaurants', '/api/restaurants?isApproved=false', '/api/restaurants?isApproved=true']) {
        const response = await request(app).get(url);
        expect(response.status).toBe(200);
        expect(response.body.data.map((r) => r.name)).toEqual(['Amma Mess']);
        expect(response.body.data[0].verificationNotes).toBeUndefined();
      }
    });

    test('search works and is case-insensitive', async () => {
      const response = await request(app).get('/api/restaurants?search=amma');
      expect(response.body.data.map((r) => r.name)).toEqual(['Amma Mess']);
    });

    test("restaurant detail hides unapproved restaurants and the owner's email", async () => {
      const shown = await request(app).get(`/api/restaurants/${approved.id}`);
      expect(shown.status).toBe(200);
      expect(shown.body.data.owner).toBeUndefined();
      expect(shown.body.data.ownerId).toBeUndefined();

      expect((await request(app).get(`/api/restaurants/${pending.id}`)).status).toBe(404);
    });
  });

  describe('GET /api/admin/restaurants', () => {
    test('filters by review status and includes owner contact details and counts', async () => {
      const response = await request(app).get('/api/admin/restaurants?status=pending').set(adminHeaders);
      expect(response.status).toBe(200);
      expect(response.body.data.map((r) => r.name)).toEqual(['Pending Kitchen']);
      expect(response.body.data[0].owner).toMatchObject({ email: 'sa-owner@test.com', firstName: 'Restaurant' });
      expect(response.body.meta.counts).toEqual({ pending: 1, verified: 1, rejected: 1 });

      const rejectedList = await request(app).get('/api/admin/restaurants?status=rejected').set(adminHeaders);
      expect(rejectedList.body.data[0]).toMatchObject({ name: 'Rejected Diner', verificationNotes: 'FSSAI licence missing' });
    });

    test('searches by name', async () => {
      const response = await request(app).get('/api/admin/restaurants?search=kitchen').set(adminHeaders);
      expect(response.body.data.map((r) => r.name)).toEqual(['Pending Kitchen']);
    });

    test('is for system admins only', async () => {
      expect((await request(app).get('/api/admin/restaurants').set(ownerHeaders)).status).toBe(403);
      expect((await request(app).get('/api/admin/restaurants').set(customerHeaders)).status).toBe(403);
      expect((await request(app).get('/api/admin/restaurants')).status).toBe(401);
    });
  });

  describe('GET /api/admin/restaurants/:id', () => {
    test('returns details, owner and order stats', async () => {
      const placed = await order(customerHeaders, 2);

      const response = await request(app).get(`/api/admin/restaurants/${approved.id}`).set(adminHeaders);
      expect(response.status).toBe(200);
      expect(response.body.data.restaurant.owner.email).toBe('sa-owner@test.com');
      expect(response.body.data.stats).toMatchObject({ orders: 1, cancelled: 0 });
      expect(response.body.data.stats.revenue).toBeCloseTo(Number(placed.total));

      expect((await request(app).get('/api/admin/restaurants/not-a-uuid').set(adminHeaders)).status).toBe(400);
    });
  });

  describe('GET /api/admin/analytics', () => {
    beforeAll(async () => {
      await models.Order.destroy({ where: {}, force: true });
    });

    test('summarizes orders, sales, top restaurants and repeat customers', async () => {
      const a = await order(customerHeaders, 1);
      const b = await order(customerHeaders, 2);
      const c = await order(otherCustomerHeaders, 1);
      await request(app).post(`/api/orders/${c.id}/cancel`).set(otherCustomerHeaders).send({ reason: 'test' });

      const response = await request(app).get('/api/admin/analytics?days=7&tzOffset=330').set(adminHeaders);
      expect(response.status).toBe(200);
      const { totals, byDay, topRestaurants, restaurants, users } = response.body.data;

      const sales = Number(a.total) + Number(b.total);
      expect(totals).toMatchObject({ orders: 3, cancelled: 1, customers: 1, repeatCustomers: 1 });
      expect(totals.revenue).toBeCloseTo(sales);
      expect(totals.averageOrderValue).toBeCloseTo(sales / 2);

      expect(byDay).toHaveLength(7);
      expect(byDay.reduce((n, d) => n + d.orders, 0)).toBe(2);
      expect(byDay.at(-1).revenue).toBeCloseTo(sales); // today, in the admin's timezone

      expect(topRestaurants).toEqual([{ id: approved.id, name: 'Amma Mess', orders: 2, revenue: expect.any(Number) }]);
      expect(restaurants).toEqual({ pending: 1, verified: 1, rejected: 1 });
      expect(users).toMatchObject({ customers: 2, partners: 1 });
    });

    test('validates the range', async () => {
      expect((await request(app).get('/api/admin/analytics?days=0').set(adminHeaders)).status).toBe(400);
      expect((await request(app).get('/api/admin/analytics?days=400').set(adminHeaders)).status).toBe(400);
      expect((await request(app).get('/api/admin/analytics').set(ownerHeaders)).status).toBe(403);
    });
  });

  describe('GET /api/orders/admin/orders', () => {
    test('includes restaurant and customer names', async () => {
      const response = await request(app).get('/api/orders/admin/orders').set(adminHeaders);
      expect(response.status).toBe(200);
      expect(response.body.data[0].restaurant).toEqual({ id: approved.id, name: 'Amma Mess' });
      expect(response.body.data[0].customer.firstName).toBe('Customer');
    });
  });
});
