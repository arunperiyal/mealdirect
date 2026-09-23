const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mess_app',
    dialect: process.env.DB_DIALECT || 'postgres',
    storage: process.env.DB_STORAGE, // For SQLite (:memory: or file path)
    logging: (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') ? false : console.log,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    retryStrategy: (times) => Math.min(times * 50, 2000)
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRE || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  },

  // API
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
  },

  // Payment
  payment: {
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
      currency: 'INR'
    },
    // Online payment (Razorpay) is offered only when switched on and configured
    onlineEnabled:
      process.env.ONLINE_PAYMENTS_ENABLED === 'true' &&
      Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    // Customers paying by UPI at the door pay MealDirect's account, shown as a QR on the rider's phone
    upi: {
      id: process.env.MEALDIRECT_UPI_ID || '',
      name: process.env.MEALDIRECT_UPI_NAME || 'MealDirect'
    }
  },

  // "Today" for rider cash settlement, in minutes east of UTC (330 = India)
  businessUtcOffsetMinutes: parseInt(process.env.BUSINESS_UTC_OFFSET_MINUTES || '330', 10),

  // Security
  security: {
    bcryptRounds: 12,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    // Per client IP, per 15 minutes. Effectively off in tests, which make many
    // requests from one address; override with the env vars to test limits.
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || (process.env.NODE_ENV === 'test' ? '100000' : '20'), 10),
      paymentMax: parseInt(process.env.RATE_LIMIT_PAYMENT_MAX || (process.env.NODE_ENV === 'test' ? '100000' : '30'), 10)
    },
    // Number of proxies in front of the API (1 behind nginx), so rate limits
    // see the real client IP. 0 when clients connect directly.
    trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10)
  },

  // CORS
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL
    ],
    credentials: true
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};
