const { checkProductionConfig } = require('../src/config/validate');

const strong = 'x'.repeat(40);
const good = {
  NODE_ENV: 'production',
  JWT_SECRET: `a${strong}`,
  JWT_REFRESH_SECRET: `b${strong}`,
  DB_HOST: 'db.internal',
  DB_USER: 'mealdirect',
  DB_PASSWORD: 'long-random-db-password',
  DB_NAME: 'mealdirect',
};

describe('checkProductionConfig', () => {
  test('accepts a complete configuration', () => {
    expect(checkProductionConfig(good)).toEqual({ errors: [], warnings: expect.any(Array) });
  });

  test('rejects missing, short, default or reused JWT secrets', () => {
    const { errors } = checkProductionConfig({
      ...good,
      JWT_SECRET: 'dev-secret-change-in-production',
      JWT_REFRESH_SECRET: undefined,
    });
    expect(errors.join('\n')).toMatch(/JWT_SECRET/);
    expect(errors.join('\n')).toMatch(/JWT_REFRESH_SECRET/);

    const reused = checkProductionConfig({ ...good, JWT_REFRESH_SECRET: good.JWT_SECRET });
    expect(reused.errors.join('\n')).toMatch(/must be different/);
  });

  test("email: warns without an SMTP server, refuses the example account", () => {
    expect(checkProductionConfig(good).warnings.join('\n')).toMatch(/password reset emails can't be sent/);
    const example = checkProductionConfig({ ...good, SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'your-email@gmail.com', SMTP_PASSWORD: 'your-app-password' });
    expect(example.errors.join('\n')).toMatch(/SMTP_USER \/ SMTP_PASSWORD are still the example values/);
    const real = checkProductionConfig({ ...good, SMTP_HOST: 'smtp.zoho.in', SMTP_USER: 'orders@mealdirect.in', SMTP_PASSWORD: 'x', SMTP_FROM: 'MealDirect <orders@mealdirect.in>' });
    expect(real.errors).toEqual([]);
    expect(real.warnings.join('\n')).not.toMatch(/SMTP/);
  });

  test('requires database credentials and rejects the compose default password', () => {
    const { errors } = checkProductionConfig({ ...good, DB_PASSWORD: 'secure_password' });
    expect(errors.join('\n')).toMatch(/DB_PASSWORD/);
    expect(checkProductionConfig({ ...good, DB_PASSWORD: '' }).errors.join('\n')).toMatch(/DB_PASSWORD/);
  });

  test('warns when payments are off, and requires a webhook secret with live keys', () => {
    expect(checkProductionConfig(good).warnings.join('\n')).toMatch(/Online payments are off/);

    const live = checkProductionConfig({ ...good, RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 'secret' });
    expect(live.errors.join('\n')).toMatch(/RAZORPAY_WEBHOOK_SECRET/);

    const half = checkProductionConfig({ ...good, RAZORPAY_KEY_ID: 'rzp_test_abc' });
    expect(half.errors.join('\n')).toMatch(/RAZORPAY_KEY_SECRET/);
  });
});
