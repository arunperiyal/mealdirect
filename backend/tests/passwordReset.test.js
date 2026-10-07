const request = require('supertest');
const { registerAndLogin, getAuthHeaders, cleanupAllData } = require('./helpers');

let app, sequelize, models, outbox;
let user, headers;

// Forgot password: a 6-digit code by email, then a new password
describe('Password reset', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    ({ outbox } = require('../src/lib/mailer'));
    await sequelize.sync({ force: true });
    const signup = await registerAndLogin(app, 'forgetful@test.com', 'customer');
    user = signup.user;
    headers = getAuthHeaders(signup.tokens);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const ask = (email) => request(app).post('/api/auth/password-reset/request').send({ email });
  const confirm = (body) => request(app).post('/api/auth/password-reset/confirm').send({ email: 'forgetful@test.com', ...body });
  const lastCode = () => outbox.at(-1).text.match(/\b(\d{6})\b/)[1];
  // Each test needs a fresh code; the one-a-minute limit would otherwise send nothing
  const allowResend = () => models.User.update({ passwordResetSentAt: null }, { where: { id: user.id } });

  test('emails a code; the new password works and every other session ends', async () => {
    const res = await ask(' Forgetful@Test.com ');
    expect(res.status).toBe(200);
    expect(outbox.at(-1)).toMatchObject({ to: 'forgetful@test.com' });
    expect(outbox.at(-1).subject).toMatch(/^\d{6} is your MealDirect password reset code$/);
    expect(outbox.at(-1).text).toMatch(/works for 15 minutes/);

    await new Promise((r) => setTimeout(r, 1100)); // the old session's token is from an earlier second
    expect((await confirm({ code: lastCode(), password: 'BrandNew123!' })).status).toBe(200);

    const signIn = await request(app).post('/api/auth/login').send({ email: 'forgetful@test.com', password: 'BrandNew123!' });
    expect(signIn.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'forgetful@test.com', password: 'TestPass123!' })).status).toBe(401);

    // The session from before the reset is over; the new sign-in works
    const old = await request(app).get('/api/auth/me').set(headers);
    expect(old.status).toBe(401);
    expect(old.body.code).toBe('PASSWORD_CHANGED');
    expect((await request(app).get('/api/auth/me').set(getAuthHeaders(signIn.body.data))).status).toBe(200);

    // A code works once
    expect((await confirm({ code: lastCode(), password: 'Another123!' })).body.code).toBe('INVALID_CODE');
  });

  test("doesn't say whether an email has an account, and sends one email a minute", async () => {
    const before = outbox.length;
    const unknown = await ask('nobody@test.com');
    expect(unknown.status).toBe(200);
    expect(outbox.length).toBe(before);

    await allowResend();
    await ask('forgetful@test.com');
    await ask('forgetful@test.com');
    expect(outbox.length).toBe(before + 1);
  });

  test('five wrong codes use the code up; expired codes fail', async () => {
    await allowResend();
    await ask('forgetful@test.com');
    const good = lastCode();
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect((await confirm({ code: wrong, password: 'Whatever123!' })).body.code).toBe('INVALID_CODE');
    const fifth = await confirm({ code: wrong, password: 'Whatever123!' });
    expect(fifth.status).toBe(429);
    expect(fifth.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect((await confirm({ code: good, password: 'Whatever123!' })).body.code).toBe('INVALID_CODE');

    await allowResend();
    await ask('forgetful@test.com');
    await models.User.update({ passwordResetExpiresAt: new Date(Date.now() - 1000) }, { where: { id: user.id } });
    expect((await confirm({ code: lastCode(), password: 'Whatever123!' })).body.code).toBe('INVALID_CODE');
  });

  test('checks the code format and the password length; admins need 12 characters', async () => {
    expect((await confirm({ code: '12ab', password: 'Whatever123!' })).body.message).toBe('Enter the 6-digit code from the email');
    expect((await confirm({ code: '123456', password: 'short' })).status).toBe(400);

    await registerAndLogin(app, 'reset-admin@test.com', 'system_admin');
    await request(app).post('/api/auth/password-reset/request').send({ email: 'reset-admin@test.com' });
    const code = lastCode();
    const res = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ email: 'reset-admin@test.com', code, password: 'Only10chars' });
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });
});
