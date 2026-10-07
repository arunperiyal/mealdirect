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
const { businessDateString } = require('../src/lib/businessTime');
const { toCsv } = require('../src/lib/csv');

let app, sequelize, models;
let adminHeaders, owner, ownerHeaders, customerHeaders, riderHeaders, restaurant, menu;
let delivered, cancelled;

const today = () => businessDateString();
const parse = (text) => text.replace(/^\uFEFF/, '').trim().split('\r\n');

describe('Order statements (CSV)', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    adminHeaders = getAuthHeaders((await registerAndLogin(app, 'st-admin@test.com', 'system_admin')).tokens);
    owner = await registerAndLogin(app, 'st-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'st-cust@test.com', 'customer')).tokens);

    restaurant = await createRestaurant(app, owner.user.id, ownerHeaders, { name: 'Ledger, Kitchen' });
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);
    await updateDeliverySettings(app, restaurant.id, ownerHeaders, { deliveryEnabled: true, pickupEnabled: true });
    menu = await publishMenu(app, (await createMenu(app, restaurant.id, ownerHeaders)).id, ownerHeaders);

    const signup = await request(app).post('/api/auth/register').send({
      email: 'st-rider@test.com',
      password: 'TestPass123!',
      firstName: 'Ravi',
      phone: '9876500099',
      role: 'delivery_partner',
    });
    riderHeaders = getAuthHeaders({ accessToken: signup.body.data.accessToken });
    await request(app).put(`/api/admin/riders/${signup.body.data.user.id}/approve`).set(adminHeaders);

    const place = async () =>
      (
        await request(app)
          .post('/api/orders')
          .set(customerHeaders)
          .send({
            restaurantId: restaurant.id,
            menuId: menu.id,
            items: [{ menuItemId: menu.items[0].id, quantity: 2 }],
            deliveryType: 'delivery',
            deliveryAddress: '7 Ledger Lane',
            paymentMethod: 'cod',
          })
      ).body.data;
    const step = (path, headers, body = {}) => request(app).post(path).set(headers).send(body);

    delivered = await place();
    await step(`/api/orders/${delivered.id}/confirm`, ownerHeaders);
    await step(`/api/delivery/orders/${delivered.id}/claim`, riderHeaders);
    await step(`/api/orders/${delivered.id}/mark-preparing`, ownerHeaders);
    await step(`/api/orders/${delivered.id}/mark-ready`, ownerHeaders);
    await step(`/api/delivery/orders/${delivered.id}/pick-up`, riderHeaders);
    await step(`/api/delivery/orders/${delivered.id}/deliver`, riderHeaders, { collection: 'cash' });

    cancelled = await place();
    await step(`/api/orders/${cancelled.id}/cancel`, customerHeaders, { reason: 'x' });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const statement = (headers, params = { from: today(), to: today() }) =>
    request(app).get('/api/statements').query(params).set(headers).buffer(true).parse((res, cb) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => cb(null, text));
    });

  test("a customer's orders, with totals that leave out cancelled ones", async () => {
    const res = await statement(customerHeaders);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="mealdirect-orders-${today()}-to-${today()}.csv"`);

    const lines = parse(res.body);
    expect(lines[0]).toBe('Date,Order,Restaurant,Items,Delivery or pickup,Status,Subtotal,Delivery fee,Discount,Total,Payment');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain(`,${delivered.id.slice(0, 8).toUpperCase()},"Ledger, Kitchen",2 x `);
    expect(lines[1]).toMatch(/,Delivered,.*,Cash$/);
    expect(lines[2]).toMatch(/,Cancelled,/);
    expect(lines[3]).toBe(
      `Total (not counting cancelled orders),,,,,,${Number(delivered.subtotal)},${Number(delivered.deliveryFee)},0,${Number(delivered.total)}`
    );
  });

  test("a restaurant's orders show the customer and who collected the money", async () => {
    const lines = parse((await statement(ownerHeaders)).body);
    expect(lines[0]).toMatch(/^Date,Order,Restaurant,Customer,/);
    expect(lines[1]).toMatch(/,Customer User,.*,Cash,Ravi \(rider\)$/);

    const other = await registerAndLogin(app, 'st-owner2@test.com', 'restaurant_admin');
    const theirs = await createRestaurant(app, other.user.id, getAuthHeaders(other.tokens), { name: 'Other Kitchen' });
    const res = await statement(ownerHeaders, { from: today(), to: today(), restaurantId: theirs.id });
    expect(res.status).toBe(403);
  });

  test("a rider's deliveries and the cash they collected", async () => {
    const lines = parse((await statement(riderHeaders)).body);
    expect(lines[0]).toBe('Delivered,Order,Restaurant,Order total,Delivery fee,Payment');
    expect(lines).toHaveLength(5);
    expect(lines[2]).toMatch(/^Total: 1 delivery,/);
    expect(lines[3]).toBe(`Cash you collected: ${Number(delivered.total)}`);
  });

  test('periods outside the orders are empty; bad periods are refused', async () => {
    const empty = parse((await statement(customerHeaders, { from: '2020-01-01', to: '2020-01-31' })).body);
    expect(empty).toHaveLength(2);

    expect((await statement(customerHeaders, { from: '2026-02-01', to: '2026-01-01' })).body).toMatch(/INVALID_PERIOD/);
    expect((await statement(customerHeaders, { from: '2024-01-01', to: '2025-06-01' })).body).toMatch(/PERIOD_TOO_LONG/);
    expect((await statement(customerHeaders, { from: '1/2/2026', to: today() })).status).toBe(400);
    expect((await statement(adminHeaders)).status).toBe(403);
  });

  test('cells are quoted, and text that looks like a formula is not run', () => {
    expect(toCsv([['=HYPERLINK("x")', 'a,b', 'say "hi"', 12.5, null, '-5']])).toBe(
      `"'=HYPERLINK(""x"")","a,b","say ""hi""",12.5,,'-5\r\n`
    );
  });
});
