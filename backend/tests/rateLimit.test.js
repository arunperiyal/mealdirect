// Low limits for this file only; set before the app is loaded
process.env.RATE_LIMIT_AUTH_MAX = '3';
process.env.RATE_LIMIT_PAYMENT_MAX = '2';

const request = require('supertest');

let app, sequelize;

describe('Rate limits', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('login attempts are limited per client', async () => {
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'x@example.com', password: 'wrong-password' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.headers).toHaveProperty('ratelimit');
  });

  test('payment calls are limited, but the Razorpay webhook is not', async () => {
    const create = () => request(app).post('/api/payments/create-order').send({ orderId: 'x' });
    expect((await create()).status).toBe(401); // counted, then rejected for no token
    expect((await create()).status).toBe(401);
    expect((await create()).status).toBe(429);

    for (let i = 0; i < 5; i++) {
      const hook = await request(app).post('/api/payments/webhook').send({ event: 'payment.captured' });
      expect(hook.status).not.toBe(429);
    }
  });
});
