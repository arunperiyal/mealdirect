// Set test environment before importing anything
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';

// Clear require cache for modules that might have been loaded with wrong env vars
const modulesToClear = [
  './src/config',
  './src/config/database',
  './src/models/User',
  './src/models/Restaurant',
  './src/models/Menu',
  './src/models/DeliverySlot',
  './src/models/Order',
  './src/models/Payment',
  './src/models/index',
  './src/controllers/userController',
  './src/controllers/restaurantController',
  './src/controllers/menuController',
  './src/controllers/deliverySlotController',
  './src/controllers/orderController',
  './src/controllers/paymentController',
  './src/routes/auth',
  './src/routes/restaurants',
  './src/routes/menus',
  './src/routes/orders',
  './src/routes/payments',
  './src/services/razorpay',
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
