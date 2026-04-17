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

  // Payment (optional for Phase 1)
  payment: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET || '',
      publicKey: process.env.STRIPE_PUBLIC || ''
    }
  },

  // Security
  security: {
    bcryptRounds: 12,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // max requests per window
    }
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
