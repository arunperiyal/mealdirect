const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../config');

let client;

const getClient = () => {
  const { keyId, keySecret } = config.payment.razorpay;
  if (!keyId || !keySecret) {
    throw {
      code: 'PAYMENT_NOT_CONFIGURED',
      message: 'Online payments are not configured',
      statusCode: 503,
    };
  }
  if (!client) client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
};

const hmacHex = (secret, payload) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

// Constant-time comparison so signatures can't be guessed byte by byte
const safeEqual = (expected, actual) => {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(actual || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Create a Razorpay order. `amount` is in the smallest currency unit (paise).
 */
const createOrder = async ({ amount, currency, receipt, notes }) => {
  try {
    return await getClient().orders.create({ amount, currency, receipt, notes });
  } catch (error) {
    if (error.code) throw error;
    throw {
      code: 'PAYMENT_GATEWAY_ERROR',
      message: error.error?.description || 'Failed to create payment order',
      statusCode: 502,
    };
  }
};

/**
 * Verify the signature Razorpay Checkout returns after a successful payment.
 */
const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  const { keySecret } = config.payment.razorpay;
  if (!keySecret) return false;
  return safeEqual(hmacHex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`), razorpaySignature);
};

/**
 * Verify the X-Razorpay-Signature header against the raw (unparsed) webhook body.
 */
const verifyWebhookSignature = (rawBody, signature) => {
  const { webhookSecret } = config.payment.razorpay;
  if (!webhookSecret || !rawBody) return false;
  return safeEqual(hmacHex(webhookSecret, rawBody), signature);
};

module.exports = {
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
