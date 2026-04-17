const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { errorHandler, notFound } = require('./middleware/errorHandler');

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

// API Routes (will be populated in Phase 1B)
app.use('/api/auth', require('./routes/auth'));

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;
