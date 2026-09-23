const { rateLimit } = require('express-rate-limit');
const config = require('../config');

const limiter = (max, what) =>
  rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: `Too many ${what}. Please wait a few minutes and try again.`,
      }),
  });

// Login, sign-up and token refresh: slows password guessing and signup spam
const authLimiter = limiter(config.security.rateLimit.authMax, 'sign-in attempts');

// Creating and verifying payments (not the Razorpay webhook, which Razorpay retries)
const paymentLimiter = limiter(config.security.rateLimit.paymentMax, 'payment attempts');

module.exports = { authLimiter, paymentLimiter };
