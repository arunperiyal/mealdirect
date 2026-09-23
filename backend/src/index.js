const app = require('./app');
const config = require('./config');
const sequelize = require('./config/database');
const { checkProductionConfig } = require('./config/validate');
const { upgradeDatabase } = require('./db/upgrade');
const { startAutoReadyJob } = require('./jobs/autoReady');

const PORT = config.port;

/**
 * Start server and initialize database
 */
const startServer = async () => {
  // Refuse to start in production with missing or example secrets
  if (config.env === 'production') {
    const { errors, warnings } = checkProductionConfig();
    warnings.forEach((w) => console.warn(`! ${w}`));
    if (errors.length) {
      console.error('Refusing to start: the production configuration is not safe.');
      errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }
  }

  try {
    // Test database connection
    await sequelize.authenticate();
    console.info('✓ Database connection successful');

    // Development upgrades the schema on start. In production it's a deploy
    // step (npm run upgrade-db), so a schema change never happens by surprise.
    if (config.env === 'development') {
      await upgradeDatabase(sequelize);
      console.info('✓ Database schema up to date');
    }

    // Marks accepted delivery orders ready before their slot, for restaurants that turned it on
    const autoReady = startAutoReadyJob();

    // Start Express server
    const server = app.listen(PORT, () => {
      console.info(`✓ Server running on port ${PORT}`);
      console.info(`✓ Environment: ${config.env}`);
      console.info(`✓ Health check: http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.info('SIGTERM signal received: closing HTTP server');
      if (autoReady) clearInterval(autoReady);
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
