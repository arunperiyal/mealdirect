// Set test environment before importing anything
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';

// Clear require cache for modules that might have been loaded with wrong env vars
const modulesToClear = [
  './src/config',
  './src/config/database',
  './src/models/User',
  './src/models/Restaurant',
  './src/models/Menu',
  './src/models/DeliverySlot',
  './src/models/Order',
  './src/models/index',
  './src/controllers/userController',
  './src/controllers/restaurantController',
  './src/controllers/menuController',
  './src/controllers/deliverySlotController',
  './src/controllers/orderController',
  './src/routes/auth',
  './src/routes/restaurants',
  './src/routes/menus',
  './src/routes/orders',
  './src/app',
  './src/middleware/auth',
  './src/utils/tokenUtils'
];

modulesToClear.forEach(mod => {
  try {
    delete require.cache[require.resolve(mod)];
  } catch (e) {
    // Module not loaded yet, that's fine
  }
});

// Mock console.info for cleaner test output
global.console.info = jest.fn();
