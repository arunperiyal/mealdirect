// The other suites run with verification off; it's on in production
process.env.REQUIRE_EMAIL_VERIFICATION = 'true';

const request = require('supertest');
const { cleanupAllData } = require('./helpers');

let app, sequelize, models, outbox;

describe('Email verification at sign-up', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    ({ outbox } = require('../src/lib/mailer'));
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const signUp = async (email, extra = {}) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'TestPass123!', firstName: 'Neha', ...extra });
    expect(res.status).toBe(201);
    return { user: res.body.data.user, auth: { Authorization: `Bearer ${res.body.data.accessToken}` } };
  };
  const codeFor = (email) => outbox.filter((m) => m.to === email).at(-1).text.match(/\b(\d{6})\b/)[1];
  const verify = (auth, code) => request(app).post('/api/auth/verify-email').set(auth).send({ code });

  test('sign-up emails a code; until it is entered the account can only sign in and verify', async () => {
    const { user, auth } = await signUp('new@test.com');
    expect(user.isVerified).toBe(false);
    expect(outbox.at(-1)).toMatchObject({ to: 'new@test.com' });
    expect(outbox.at(-1).subject).toMatch(/^\d{6} is your MealDirect verification code$/);

    const blocked = await request(app).get('/api/orders').set(auth);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(200);
    // Public pages still work
    expect((await request(app).get('/api/restaurants')).status).toBe(200);

    const done = await verify(auth, codeFor('new@test.com'));
    expect(done.status).toBe(200);
    expect(done.body.data.user.isVerified).toBe(true);
    expect((await request(app).get('/api/orders').set(auth)).status).toBe(200);

    // Verifying again is harmless
    expect((await verify(auth, '000000')).status).toBe(200);
  });

  test('wrong and expired codes; five wrong tries use the code up; resend waits a minute', async () => {
    const { user, auth } = await signUp('slow@test.com', { role: 'delivery_partner', phone: '9876500123' });
    const good = codeFor('slow@test.com');
    const wrong = good === '000000' ? '111111' : '000000';

    expect((await verify(auth, '12ab')).status).toBe(400);
    for (let i = 0; i < 4; i++) expect((await verify(auth, wrong)).body.code).toBe('INVALID_CODE');
    expect((await verify(auth, wrong)).body.code).toBe('TOO_MANY_ATTEMPTS');
    expect((await verify(auth, good)).body.code).toBe('INVALID_CODE');

    const tooSoon = await request(app).post('/api/auth/verify-email/resend').set(auth);
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body.code).toBe('RESEND_TOO_SOON');

    await models.User.update({ verificationSentAt: null }, { where: { id: user.id } });
    expect((await request(app).post('/api/auth/verify-email/resend').set(auth)).status).toBe(200);
    await models.User.update({ verificationTokenExpiry: new Date(Date.now() - 1000) }, { where: { id: user.id } });
    expect((await verify(auth, codeFor('slow@test.com'))).body.code).toBe('INVALID_CODE');
  });

  test('admins made on the server are verified from the start', async () => {
    const { createSystemAdmin } = require('../src/controllers/userController');
    const admin = await createSystemAdmin({ email: 'staff@test.com', password: 'LongEnough1234!', firstName: 'Asha' });
    expect(admin.isVerified).toBe(true);
  });
});
