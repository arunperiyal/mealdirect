const crypto = require('crypto');
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

// Only the network call to Razorpay is mocked; signature checks run for real
jest.mock('../src/services/razorpay', () => {
  const actual = jest.requireActual('../src/services/razorpay');
  return { ...actual, createOrder: jest.fn() };
});

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

const sign = (secret, payload) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

let app, sequelize, models, razorpay;
let customerHeaders, otherCustomerHeaders, adminHeaders;
let restaurantAdmin, restaurantAdminHeaders;
let restaurant, menu;
let razorpayOrderCounter = 0;

const placeOrder = async (paymentMethod = 'online', headers = customerHeaders) => {
  const response = await request(app)
    .post('/api/orders')
    .set(headers)
    .send({
      restaurantId: restaurant.id,
      menuId: menu.id,
      items: [{ menuItemId: menu.items[0].id, quantity: 2 }],
      deliveryAddress: '123 Customer Ave',
      deliveryType: 'delivery',
      paymentMethod,
    });
  expect(response.status).toBe(201);
  return response.body.data;
};

const createPaymentOrder = (orderId, headers = customerHeaders) =>
  request(app).post('/api/payments/create-order').set(headers).send({ orderId });

const sendWebhook = (payload, secret = WEBHOOK_SECRET) => {
  const body = JSON.stringify(payload);
  return request(app)
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', sign(secret, body))
    .send(body);
};

const paymentEvent = (event, razorpayOrderId, amount, extra = {}) => ({
  event,
  payload: {
    payment: {
      entity: {
        id: 'pay_webhook123',
        order_id: razorpayOrderId,
        amount,
        method: 'upi',
        ...extra,
      },
    },
  },
});

describe('Payment API (Razorpay)', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    razorpay = require('../src/services/razorpay');

    await sequelize.sync({ force: true });

    const custResult = await registerAndLogin(app, 'payer@test.com', 'customer');
    customerHeaders = getAuthHeaders(custResult.tokens);

    const otherResult = await registerAndLogin(app, 'other@test.com', 'customer');
    otherCustomerHeaders = getAuthHeaders(otherResult.tokens);

    const adminResult = await registerAndLogin(app, 'payadmin@test.com', 'system_admin');
    adminHeaders = getAuthHeaders(adminResult.tokens);

    const restResult = await registerAndLogin(app, 'payrest@test.com', 'restaurant_admin');
    restaurantAdmin = restResult.user;
    restaurantAdminHeaders = getAuthHeaders(restResult.tokens);

    restaurant = await createRestaurant(app, restaurantAdmin.id, restaurantAdminHeaders);
    restaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

    menu = await createMenu(app, restaurant.id, restaurantAdminHeaders);
    menu = await publishMenu(app, menu.id, restaurantAdminHeaders);
  });

  beforeEach(() => {
    razorpay.createOrder.mockReset();
    razorpay.createOrder.mockImplementation(async ({ amount, currency }) => ({
      id: `order_test${++razorpayOrderCounter}`,
      amount,
      currency,
      status: 'created',
    }));
  });

  afterEach(async () => {
    await models.Payment.destroy({ where: {}, force: true });
    await models.Order.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  describe('POST /api/payments/create-order', () => {
    test('creates a Razorpay order for the server-side order total', async () => {
      const order = await placeOrder();
      const response = await createPaymentOrder(order.id);

      expect(response.status).toBe(201);
      expect(response.body.data.razorpayOrderId).toMatch(/^order_test/);
      expect(response.body.data.amount).toBe(Math.round(Number(order.total) * 100));
      expect(response.body.data.currency).toBe('INR');
      expect(response.body.data.keyId).toBe(process.env.RAZORPAY_KEY_ID);
      expect(razorpay.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ receipt: order.id, notes: { orderId: order.id } })
      );
    });

    test('reuses the open Razorpay order on retry', async () => {
      const order = await placeOrder();
      const first = await createPaymentOrder(order.id);
      const second = await createPaymentOrder(order.id);

      expect(second.status).toBe(201);
      expect(second.body.data.razorpayOrderId).toBe(first.body.data.razorpayOrderId);
      expect(razorpay.createOrder).toHaveBeenCalledTimes(1);
    });

    test('rejects cash on delivery orders', async () => {
      const order = await placeOrder('cod');
      const response = await createPaymentOrder(order.id);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('COD_ORDER');
      expect(razorpay.createOrder).not.toHaveBeenCalled();
    });

    test("rejects another customer's order", async () => {
      const order = await placeOrder();
      const response = await createPaymentOrder(order.id, otherCustomerHeaders);

      expect(response.status).toBe(403);
    });

    test('rejects non-customers and unauthenticated requests', async () => {
      const order = await placeOrder();

      expect((await createPaymentOrder(order.id, restaurantAdminHeaders)).status).toBe(403);
      expect(
        (await request(app).post('/api/payments/create-order').send({ orderId: order.id })).status
      ).toBe(401);
    });

    test('returns 404 for unknown order and 400 for invalid id', async () => {
      expect((await createPaymentOrder(crypto.randomUUID())).status).toBe(404);
      expect((await createPaymentOrder('not-a-uuid')).status).toBe(400);
    });

    test('maps gateway failures to 502', async () => {
      razorpay.createOrder.mockRejectedValue({
        code: 'PAYMENT_GATEWAY_ERROR',
        message: 'Gateway down',
        statusCode: 502,
      });
      const order = await placeOrder();
      const response = await createPaymentOrder(order.id);

      expect(response.status).toBe(502);
      expect(await models.Payment.count()).toBe(0);
    });
  });

  describe('POST /api/payments/verify-payment', () => {
    const verify = (body, headers = customerHeaders) =>
      request(app).post('/api/payments/verify-payment').set(headers).send(body);

    test('verifies a valid signature, marks order paid and confirmed', async () => {
      const order = await placeOrder();
      const { razorpayOrderId } = (await createPaymentOrder(order.id)).body.data;
      const razorpayPaymentId = 'pay_abc123';

      const response = await verify({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: sign(KEY_SECRET, `${razorpayOrderId}|${razorpayPaymentId}`),
      });

      expect(response.status).toBe(200);
      expect(response.body.data.payment.status).toBe('authorized');
      expect(response.body.data.payment.razorpaySignature).toBeUndefined();
      expect(response.body.data.order.paymentStatus).toBe('completed');
      expect(response.body.data.order.status).toBe('confirmed');
      expect(response.body.data.order.paymentId).toBe(razorpayPaymentId);

      const saved = await models.Order.findByPk(order.id);
      expect(saved.statusHistory.map((h) => h.status)).toEqual(['pending', 'confirmed']);
    });

    test('rejects a tampered signature and leaves the order unpaid', async () => {
      const order = await placeOrder();
      const { razorpayOrderId } = (await createPaymentOrder(order.id)).body.data;

      const response = await verify({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: 'pay_abc123',
        razorpay_signature: sign('wrong_secret', `${razorpayOrderId}|pay_abc123`),
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_SIGNATURE');
      const saved = await models.Order.findByPk(order.id);
      expect(saved.paymentStatus).toBe('pending');
      expect(saved.status).toBe('pending');
    });

    test("rejects verifying another customer's payment", async () => {
      const order = await placeOrder();
      const { razorpayOrderId } = (await createPaymentOrder(order.id)).body.data;

      const response = await verify(
        {
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: 'pay_abc123',
          razorpay_signature: sign(KEY_SECRET, `${razorpayOrderId}|pay_abc123`),
        },
        otherCustomerHeaders
      );

      expect(response.status).toBe(403);
    });

    test('rejects missing fields', async () => {
      const response = await verify({ razorpay_order_id: 'order_x' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    test('blocks creating a new payment once paid', async () => {
      const order = await placeOrder();
      const { razorpayOrderId } = (await createPaymentOrder(order.id)).body.data;
      await verify({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: 'pay_abc123',
        razorpay_signature: sign(KEY_SECRET, `${razorpayOrderId}|pay_abc123`),
      });

      const response = await createPaymentOrder(order.id);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ALREADY_PAID');
    });
  });

  describe('POST /api/payments/webhook', () => {
    test('payment.captured marks payment captured and order confirmed', async () => {
      const order = await placeOrder();
      const { razorpayOrderId, amount } = (await createPaymentOrder(order.id)).body.data;

      const response = await sendWebhook(paymentEvent('payment.captured', razorpayOrderId, amount));

      expect(response.status).toBe(200);
      expect(response.body.data.handled).toBe(true);

      const payment = await models.Payment.findOne({ where: { razorpayOrderId } });
      expect(payment.status).toBe('captured');
      expect(payment.method).toBe('upi');
      const saved = await models.Order.findByPk(order.id);
      expect(saved.paymentStatus).toBe('completed');
      expect(saved.status).toBe('confirmed');
    });

    test('payment.failed records the error; a later capture still succeeds', async () => {
      const order = await placeOrder();
      const { razorpayOrderId, amount } = (await createPaymentOrder(order.id)).body.data;

      await sendWebhook(
        paymentEvent('payment.failed', razorpayOrderId, amount, {
          error_description: 'Card declined',
        })
      );
      let payment = await models.Payment.findOne({ where: { razorpayOrderId } });
      expect(payment.status).toBe('failed');
      expect(payment.errorMessage).toBe('Card declined');
      expect((await models.Order.findByPk(order.id)).paymentStatus).toBe('failed');

      await sendWebhook(paymentEvent('payment.captured', razorpayOrderId, amount));
      payment = await models.Payment.findOne({ where: { razorpayOrderId } });
      expect(payment.status).toBe('captured');
      expect(payment.errorMessage).toBeNull();
      expect((await models.Order.findByPk(order.id)).paymentStatus).toBe('completed');
    });

    test('does not downgrade a captured payment', async () => {
      const order = await placeOrder();
      const { razorpayOrderId, amount } = (await createPaymentOrder(order.id)).body.data;

      await sendWebhook(paymentEvent('payment.captured', razorpayOrderId, amount));
      await sendWebhook(paymentEvent('payment.authorized', razorpayOrderId, amount));
      await sendWebhook(paymentEvent('payment.failed', razorpayOrderId, amount));

      const payment = await models.Payment.findOne({ where: { razorpayOrderId } });
      expect(payment.status).toBe('captured');
      expect((await models.Order.findByPk(order.id)).paymentStatus).toBe('completed');
    });

    test('rejects an invalid signature', async () => {
      const order = await placeOrder();
      const { razorpayOrderId, amount } = (await createPaymentOrder(order.id)).body.data;

      const response = await sendWebhook(
        paymentEvent('payment.captured', razorpayOrderId, amount),
        'wrong_secret'
      );

      expect(response.status).toBe(400);
      expect((await models.Order.findByPk(order.id)).paymentStatus).toBe('pending');
    });

    test('ignores an amount mismatch', async () => {
      const order = await placeOrder();
      const { razorpayOrderId, amount } = (await createPaymentOrder(order.id)).body.data;

      const response = await sendWebhook(
        paymentEvent('payment.captured', razorpayOrderId, amount - 100)
      );

      expect(response.status).toBe(200);
      expect(response.body.data.handled).toBe(false);
      expect((await models.Order.findByPk(order.id)).paymentStatus).toBe('pending');
    });

    test('acknowledges unknown orders and unsupported events', async () => {
      const unknown = await sendWebhook(paymentEvent('payment.captured', 'order_unknown', 100));
      expect(unknown.status).toBe(200);
      expect(unknown.body.data.handled).toBe(false);

      const other = await sendWebhook({ event: 'refund.created', payload: {} });
      expect(other.status).toBe(200);
      expect(other.body.data.handled).toBe(false);
    });
  });

  describe('GET /api/payments/status/:orderId', () => {
    test('returns payment status to the owner without signatures', async () => {
      const order = await placeOrder();
      await createPaymentOrder(order.id);

      const response = await request(app)
        .get(`/api/payments/status/${order.id}`)
        .set(customerHeaders);

      expect(response.status).toBe(200);
      expect(response.body.data.paymentMethod).toBe('online');
      expect(response.body.data.paymentStatus).toBe('pending');
      expect(response.body.data.payments).toHaveLength(1);
      expect(response.body.data.payments[0].razorpaySignature).toBeUndefined();
    });

    test('allows system admin and blocks other customers', async () => {
      const order = await placeOrder();

      const admin = await request(app).get(`/api/payments/status/${order.id}`).set(adminHeaders);
      expect(admin.status).toBe(200);

      const other = await request(app)
        .get(`/api/payments/status/${order.id}`)
        .set(otherCustomerHeaders);
      expect(other.status).toBe(403);
    });
  });

  describe('Order confirmation guard', () => {
    const orderController = () => require('../src/controllers/orderController');

    test('restaurant cannot confirm an unpaid online order', async () => {
      const order = await placeOrder();

      await expect(
        orderController().confirmOrder(order.id, order.restaurantId, restaurantAdmin.id)
      ).rejects.toMatchObject({ code: 'PAYMENT_PENDING', statusCode: 409 });
    });

    test('COD orders can still be confirmed without payment', async () => {
      const order = await placeOrder('cod');

      const confirmed = await orderController().confirmOrder(
        order.id,
        order.restaurantId,
        restaurantAdmin.id
      );
      expect(confirmed.status).toBe('confirmed');
    });
  });
});
