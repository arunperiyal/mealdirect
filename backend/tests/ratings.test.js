process.env.ONLINE_PAYMENTS_ENABLED = 'false';

const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  updateDeliverySettings,
  createMenu,
  publishMenu,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;
let adminHeaders, ownerHeaders, customerHeaders, otherHeaders, rider, riderHeaders, restaurant, menu;

// Customers rate the food and the delivery of an order that has arrived
describe('Ratings', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'rate-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'rate-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'rate-cust@test.com', 'customer')).tokens);
    otherHeaders = getAuthHeaders((await registerAndLogin(app, 'rate-other@test.com', 'customer')).tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Starry Kitchen' });
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, { deliveryEnabled: true, pickupEnabled: true });
    menu = await publishMenu(app, (await createMenu(app, restaurant.id, ownerHeaders)).id, ownerHeaders);

    const signup = await request(app).post('/api/auth/register').send({
      email: 'rate-rider@test.com',
      password: 'TestPass123!',
      firstName: 'Ravi',
      phone: '9876500088',
      role: 'delivery_partner',
    });
    rider = signup.body.data.user;
    riderHeaders = getAuthHeaders({ accessToken: signup.body.data.accessToken });
    await request(app).put(`/api/admin/riders/${rider.id}/approve`).set(adminHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const step = (path, headers, body = {}) => request(app).post(path).set(headers).send(body);
  const place = async (deliveryType = 'delivery', headers = customerHeaders) =>
    (
      await request(app)
        .post('/api/orders')
        .set(headers)
        .send({
          restaurantId: restaurant.id,
          menuId: menu.id,
          items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
          deliveryType,
          deliveryAddress: '5 Star Street',
          paymentMethod: 'cod',
        })
    ).body.data;

  // A delivery order brought by the rider
  const delivered = async () => {
    const order = await place();
    await step(`/api/orders/${order.id}/confirm`, ownerHeaders);
    await step(`/api/delivery/orders/${order.id}/claim`, riderHeaders);
    await step(`/api/orders/${order.id}/mark-preparing`, ownerHeaders);
    await step(`/api/orders/${order.id}/mark-ready`, ownerHeaders);
    await step(`/api/delivery/orders/${order.id}/pick-up`, riderHeaders);
    await step(`/api/delivery/orders/${order.id}/deliver`, riderHeaders, { collection: 'upi' });
    return order;
  };
  const rate = (id, body, headers = customerHeaders) =>
    request(app).put(`/api/orders/${id}/rating`).set(headers).send(body);

  test('rates the food and the delivery; everyone involved sees it on the order', async () => {
    const order = await delivered();
    const res = await rate(order.id, { foodRating: 4, foodComment: ' Tasty dal ', deliveryRating: 5, deliveryComment: 'Quick' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ foodRating: 4, foodComment: 'Tasty dal', deliveryRating: 5, riderId: rider.id });

    for (const headers of [customerHeaders, ownerHeaders, adminHeaders]) {
      const seen = await request(app).get(`/api/orders/${order.id}`).set(headers);
      expect(seen.body.data.rating).toMatchObject({ foodRating: 4, deliveryRating: 5, deliveryComment: 'Quick' });
    }
    const mine = await request(app).get('/api/orders').set(customerHeaders);
    expect(mine.body.data.find((o) => o.id === order.id).rating.foodRating).toBe(4);

    // Rating again replaces the whole rating, and the restaurant's stars follow
    await rate(order.id, { foodRating: 2, deliveryRating: 5, deliveryComment: 'Quick' });
    const listed = await request(app).get(`/api/restaurants/${restaurant.id}`);
    expect(Number(listed.body.data.avgRating)).toBe(2);
    expect(listed.body.data.totalReviews).toBe(1);
  });

  test('the restaurant average, star counts and recent comments are public', async () => {
    const second = await delivered();
    await rate(second.id, { foodRating: 5, foodComment: 'Best thali' });

    const res = await request(app).get(`/api/restaurants/${restaurant.id}/ratings`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ average: 3.5, count: 2, byStars: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 1 } });
    expect(res.body.data.recent).toEqual([
      expect.objectContaining({ rating: 5, comment: 'Best thali', name: 'Customer' }),
    ]);
    expect(res.body.data.recent[0].email).toBeUndefined();
  });

  test('the rider sees their delivery ratings; admins see the average', async () => {
    const mine = await request(app).get('/api/delivery/ratings').set(riderHeaders);
    // The second order was rated without a delivery rating
    expect(mine.body.data).toMatchObject({ average: 5, count: 1 });
    expect(mine.body.data.recent[0]).toMatchObject({ rating: 5, comment: 'Quick' });

    const riders = await request(app).get('/api/admin/riders').set(adminHeaders);
    expect(riders.body.data.find((r) => r.id === rider.id).rating).toEqual({ average: 5, count: 1 });
    const detail = await request(app).get(`/api/admin/riders/${rider.id}/cash`).set(adminHeaders);
    expect(detail.body.data.ratings).toMatchObject({ average: 5, count: 1 });
  });

  test('only after it arrives, only the customer, only within 7 days', async () => {
    const open = await place();
    expect((await rate(open.id, { foodRating: 5 })).body.code).toBe('NOT_DELIVERED');

    const order = await delivered();
    expect((await rate(order.id, { foodRating: 5 }, otherHeaders)).status).toBe(403);
    expect((await rate(order.id, { foodRating: 5 }, ownerHeaders)).status).toBe(403);
    expect((await rate(order.id, { foodRating: 6 })).status).toBe(400);
    expect((await rate(order.id, {})).status).toBe(400);

    await models.Order.update({ deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }, { where: { id: order.id } });
    expect((await rate(order.id, { foodRating: 5 })).body.code).toBe('RATING_CLOSED');

    await request(app).post(`/api/orders/${open.id}/cancel`).set(customerHeaders).send({ reason: 'x' });
  });

  test('pickup orders get a food rating only', async () => {
    const order = await place('pickup');
    await step(`/api/orders/${order.id}/confirm`, ownerHeaders);
    await step(`/api/orders/${order.id}/mark-preparing`, ownerHeaders);
    await step(`/api/orders/${order.id}/mark-ready`, ownerHeaders);
    await step(`/api/orders/${order.id}/mark-picked-up`, customerHeaders);

    expect((await rate(order.id, { foodRating: 4, deliveryRating: 3 })).body.code).toBe('NO_RIDER');
    expect((await rate(order.id, { foodRating: 4 })).status).toBe(200);
  });
});
