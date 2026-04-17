const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { verifyToken, authorize } = require('./middleware/auth');

// Create Express app
const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors(config.cors));

// Body parsing
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Request logging middleware (simplified)
app.use((req, res, next) => {
  console.info(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint (no auth required)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/restaurants', require('./routes/restaurants'));
app.use('/api/menus', require('./routes/menus'));
app.use('/api/orders', require('./routes/orders'));

// Test endpoints (only in development and test)
if (config.env === 'development' || config.env === 'test') {
  app.get('/api/test/protected', verifyToken, (req, res) => {
    res.status(200).json({
      success: true,
      message: 'This is a protected endpoint',
      user: req.user,
    });
  });

  app.get('/api/test/admin', verifyToken, authorize(['system_admin']), (req, res) => {
    res.status(200).json({
      success: true,
      message: 'This is an admin-only endpoint',
      user: req.user,
    });
  });

  app.get('/api/test/restaurant', verifyToken, authorize(['restaurant_admin']), (req, res) => {
    res.status(200).json({
      success: true,
      message: 'This is a restaurant-admin-only endpoint',
      user: req.user,
    });
  });
}

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;
