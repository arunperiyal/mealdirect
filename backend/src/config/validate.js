// Values that ship in this repo; any of them in production means secrets weren't set
const KNOWN_DEFAULTS = new Set([
  'dev-secret-change-in-production',
  'dev-refresh-secret',
  'change-me-in-production',
  'your-super-secret-jwt-key-change-in-production-min-32-chars',
  'your-refresh-token-secret-min-32-chars',
  'secure_password',
  'secure_password_here',
]);

const MIN_SECRET_LENGTH = 32;

/**
 * Check the environment before starting in production. Returns problems that
 * must stop startup (errors) and ones worth knowing about (warnings).
 */
const checkProductionConfig = (env = process.env) => {
  const errors = [];
  const warnings = [];

  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = env[name];
    if (!value) errors.push(`${name} is not set`);
    else if (KNOWN_DEFAULTS.has(value)) errors.push(`${name} is still the example value from this repo`);
    else if (value.length < MIN_SECRET_LENGTH) errors.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }

  if ((env.DB_DIALECT || 'postgres') === 'postgres') {
    for (const name of ['DB_HOST', 'DB_USER', 'DB_NAME']) {
      if (!env[name]) errors.push(`${name} is not set`);
    }
    if (!env.DB_PASSWORD) errors.push('DB_PASSWORD is not set');
    else if (KNOWN_DEFAULTS.has(env.DB_PASSWORD)) errors.push('DB_PASSWORD is still the example value from this repo');
  }

  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_WEBHOOK_SECRET: webhookSecret } = env;
  if (!keyId && !keySecret) {
    warnings.push('Online payments are off: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set');
  } else {
    if (!keyId) errors.push('RAZORPAY_KEY_ID is not set but RAZORPAY_KEY_SECRET is');
    if (!keySecret) errors.push('RAZORPAY_KEY_SECRET is not set but RAZORPAY_KEY_ID is');
    if (keyId?.startsWith('rzp_live_') && !webhookSecret) {
      errors.push('RAZORPAY_WEBHOOK_SECRET is required with live keys, or paid orders can be missed');
    } else if (!webhookSecret) {
      warnings.push('RAZORPAY_WEBHOOK_SECRET is not set: payments only confirm through the app');
    }
  }

  return { errors, warnings };
};

module.exports = { checkProductionConfig };
