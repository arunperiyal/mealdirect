const app = require('./app');
const config = require('./config');
const sequelize = require('./config/database');

// Import models to register them with Sequelize
const models = require('./models');

const PORT = config.port;

/**
 * Start server and initialize database
 */
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.info('✓ Database connection successful');

    // Sync database models (creates tables if not exist)
    // In production, use migrations instead
    if (config.env === 'development') {
      await sequelize.sync({ alter: true });
      console.info('✓ Database models synchronized');
    }

    // Start Express server
    const server = app.listen(PORT, () => {
      console.info(`✓ Server running on port ${PORT}`);
      console.info(`✓ Environment: ${config.env}`);
      console.info(`✓ Health check: http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        console.info('HTTP server closed');
        await sequelize.close();
        console.info('Database connection closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start if this is the main module
if (require.main === module) {
  startServer();
}

module.exports = startServer;
