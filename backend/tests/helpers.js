const request = require('supertest');

/**
 * Test Helper Utilities for Phase 1D Integration Tests
 * Provides reusable functions for:
 * - User registration and authentication
 * - Restaurant setup and approval
 * - Menu and delivery slot management
 * - Order creation
 * - Auth headers and token management
 */

// ============== AUTH HELPERS ==============

/**
 * Register and login a user in one operation
 * @param {string} email - User email
 * @param {string} role - User role (customer, restaurant_admin, system_admin)
 * @param {Express.app} app - Express app instance
 * @returns {Promise<{user, tokens}>}
 */
async function registerAndLogin(app, email, role = 'customer') {
  const userData = {
    email,
    password: 'TestPass123!',
    firstName: role === 'customer' ? 'Customer' : role === 'restaurant_admin' ? 'Restaurant' : 'Admin',
    lastName: 'User',
    role,
  };

  const response = await request(app).post('/api/auth/register').send(userData);

  if (response.status !== 201) {
    throw new Error(`Failed to register user: ${response.body.message}`);
  }

  return {
    user: response.body.data.user,
    tokens: {
      accessToken: response.body.data.accessToken,
      refreshToken: response.body.data.refreshToken,
    },
  };
}

/**
 * Get authorization headers from tokens
 * @param {object} tokens - Token object {accessToken, refreshToken}
 * @returns {object} Headers with Authorization bearer token
 */
function getAuthHeaders(tokens) {
  return {
    Authorization: `Bearer ${tokens.accessToken}`,
  };
}

/**
 * Create a user and return user object without tokens
 * @param {Express.app} app - Express app instance
 * @param {string} email - User email
 * @param {string} role - User role
 * @returns {Promise<{user, headers}>}
 */
async function createUserWithRole(app, email, role) {
  const result = await registerAndLogin(app, email, role);
  return {
    user: result.user,
    headers: getAuthHeaders(result.tokens),
  };
}

// ============== RESTAURANT HELPERS ==============

/**
 * Create a restaurant as a restaurant_admin
 * @param {Express.app} app - Express app instance
 * @param {string} ownerId - Owner user ID
 * @param {string} headers - Auth headers
 * @param {object} data - Optional restaurant data
 * @returns {Promise<object>} Restaurant object
 */
async function createRestaurant(app, ownerId, headers, data = {}) {
  const restaurantData = {
    name: data.name || `Test Restaurant ${Date.now()}`,
    email: data.email || `restaurant${Date.now()}@test.com`,
    phone: data.phone || '9876543210',
    description: data.description || 'Test restaurant description',
    address: data.address || '123 Main St',
    city: data.city || 'Test City',
    zipCode: data.zipCode || '12345',
    ...data,
  };

  const response = await request(app)
    .post('/api/restaurants')
    .set(headers)
    .send(restaurantData);

  if (response.status !== 201) {
    throw new Error(`Failed to create restaurant: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Get restaurant details
 * @param {Express.app} app - Express app instance
 * @param {string} restaurantId - Restaurant ID
 * @param {object} headers - Auth headers (optional)
 * @returns {Promise<object>} Restaurant object
 */
async function getRestaurant(app, restaurantId, headers = {}) {
  const response = await request(app)
    .get(`/api/restaurants/${restaurantId}`)
    .set(headers);

  if (response.status !== 200) {
    throw new Error(`Failed to get restaurant: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Approve a restaurant (admin only)
 * @param {Express.app} app - Express app instance
 * @param {string} restaurantId - Restaurant ID
 * @param {object} headers - Admin auth headers
 * @returns {Promise<object>} Updated restaurant object
 */
async function approveRestaurant(app, restaurantId, headers) {
  const response = await request(app)
    .put(`/api/restaurants/admin/${restaurantId}/approve`)
    .set(headers)
    .send({});

  if (response.status !== 200) {
    throw new Error(`Failed to approve restaurant: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Reject a restaurant (admin only)
 * @param {Express.app} app - Express app instance
 * @param {string} restaurantId - Restaurant ID
 * @param {object} headers - Admin auth headers
 * @param {object} data - Rejection data {notes}
 * @returns {Promise<object>} Updated restaurant object
 */
async function rejectRestaurant(app, restaurantId, headers, data = {}) {
  const response = await request(app)
    .put(`/api/restaurants/admin/${restaurantId}/reject`)
    .set(headers)
    .send({
      notes: data.notes || 'Documents not valid',
    });

  if (response.status !== 200) {
    throw new Error(`Failed to reject restaurant: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Update restaurant delivery settings
 * @param {Express.app} app - Express app instance
 * @param {string} restaurantId - Restaurant ID
 * @param {object} headers - Owner auth headers
 * @param {object} settings - Delivery settings
 * @returns {Promise<object>} Updated restaurant object
 */
async function updateDeliverySettings(app, restaurantId, headers, settings) {
  const response = await request(app)
    .put(`/api/restaurants/${restaurantId}/delivery-settings`)
    .set(headers)
    .send(settings);

  if (response.status !== 200) {
    throw new Error(`Failed to update delivery settings: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Setup a complete restaurant (create, approve, return with headers)
 * @param {Express.app} app - Express app instance
 * @param {object} adminHeaders - Admin auth headers for approval
 * @param {object} ownerData - Restaurant owner data
 * @param {object} restaurantData - Restaurant data
 * @returns {Promise<{restaurant, headers}>}
 */
async function setupCompleteRestaurant(app, adminHeaders, ownerData, restaurantData = {}) {
  // Create restaurant owner
  const ownerResult = await createUserWithRole(app, ownerData.email || `owner${Date.now()}@test.com`, 'restaurant_admin');

  // Create restaurant
  const restaurant = await createRestaurant(app, ownerResult.user.id, ownerResult.headers, restaurantData);

  // Approve restaurant
  const approvedRestaurant = await approveRestaurant(app, restaurant.id, adminHeaders);

  return {
    restaurant: approvedRestaurant,
    owner: ownerResult.user,
    headers: ownerResult.headers,
  };
}

// ============== MENU HELPERS ==============

/**
 * Create a menu for a restaurant
 * @param {Express.app} app - Express app instance
 * @param {string} restaurantId - Restaurant ID
 * @param {object} headers - Owner auth headers
 * @param {object} data - Menu data with optional items array
 * @returns {Promise<object>} Menu object with items
 */
async function createMenu(app, restaurantId, headers, data = {}) {
  const date = data.date || new Date().toISOString().split('T')[0];
  const items = (data.items && data.items.length > 0) ? data.items : [
    { name: 'Item 1', description: 'Test item', price: 100, quantity: 50 },
    { name: 'Item 2', description: 'Test item', price: 150, quantity: 30 },
  ];

  // Create menu
  const createResponse = await request(app)
    .post(`/api/menus`)
    .set(headers)
    .send({
      restaurantId,
      date,
    });

  if (createResponse.status !== 201) {
    throw new Error(`Failed to create menu: ${createResponse.body.message}`);
  }

  const menu = createResponse.body.data;

  // Add items to menu
  const itemsResponse = await request(app)
    .post(`/api/menus/${menu.id}/items`)
    .set(headers)
    .send({ items });

  if (itemsResponse.status !== 200) {
    throw new Error(`Failed to add menu items: ${itemsResponse.body.message}`);
  }

  return itemsResponse.body.data;
}

/**
 * Get menu details
 * @param {Express.app} app - Express app instance
 * @param {string} menuId - Menu ID
 * @param {object} headers - Auth headers (optional)
 * @returns {Promise<object>} Menu object
 */
async function getMenu(app, menuId, headers = {}) {
  const response = await request(app)
    .get(`/api/menus/${menuId}`)
    .set(headers);

  if (response.status !== 200) {
    throw new Error(`Failed to get menu: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Publish a menu (draft → published)
 * @param {Express.app} app - Express app instance
 * @param {string} menuId - Menu ID
 * @param {object} headers - Owner auth headers
 * @returns {Promise<object>} Updated menu object
 */
async function publishMenu(app, menuId, headers) {
  const response = await request(app)
    .post(`/api/menus/${menuId}/publish`)
    .set(headers)
    .send({});

  if (response.status !== 200) {
    throw new Error(`Failed to publish menu: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Archive a menu (published → archived)
 * @param {Express.app} app - Express app instance
 * @param {string} menuId - Menu ID
 * @param {object} headers - Owner auth headers
 * @returns {Promise<object>} Updated menu object
 */
async function archiveMenu(app, menuId, headers) {
  const response = await request(app)
    .post(`/api/menus/${menuId}/archive`)
    .set(headers)
    .send({});

  if (response.status !== 200) {
    throw new Error(`Failed to archive menu: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Add delivery slots to a menu
 * @param {Express.app} app - Express app instance
 * @param {string} menuId - Menu ID
 * @param {string} restaurantId - Restaurant ID
 * @param {object} headers - Owner auth headers
 * @param {array} slots - Slot data [{startTime: '18:00', endTime: '18:30', maxOrders: 20}, ...]
 * @returns {Promise<array>} Created slots
 */
async function addDeliverySlots(app, menuId, restaurantId, headers, slots = []) {
  if (slots.length === 0) {
    slots = [
      { startTime: '18:00', endTime: '18:30', maxOrders: 20 },
      { startTime: '18:30', endTime: '19:00', maxOrders: 20 },
      { startTime: '19:00', endTime: '19:30', maxOrders: 15 },
    ];
  }

  // Create slots one at a time (API creates single slots)
  const createdSlots = [];
  for (const slot of slots) {
    const response = await request(app)
      .post(`/api/menus/${menuId}/slots`)
      .set(headers)
      .send({
        restaurantId,
        ...slot,
      });

    if (response.status !== 201) {
      console.error('Slot creation error:', response.status, JSON.stringify(response.body));
      throw new Error(`Failed to add delivery slot (${response.status}): ${response.body?.message || JSON.stringify(response.body)}`);
    }

    createdSlots.push(response.body.data);
  }

  return createdSlots;
}

/**
 * Setup complete menu (create, add slots, publish)
 * @param {Express.app} app - Express app instance
 * @param {string} restaurantId - Restaurant ID
 * @param {object} headers - Owner auth headers
 * @param {object} menuData - Menu data (optional)
 * @returns {Promise<{menu, slots}>}
 */
async function setupCompleteMenu(app, restaurantId, headers, menuData = {}) {
  // Create menu
  const menu = await createMenu(app, restaurantId, headers, menuData);

  // Add delivery slots
  const slots = await addDeliverySlots(app, menu.id, restaurantId, headers);

  // Publish menu
  const publishedMenu = await publishMenu(app, menu.id, headers);

  return {
    menu: publishedMenu,
    slots,
  };
}

// ============== ORDER HELPERS ==============

/**
 * Create an order for a customer
 * @param {Express.app} app - Express app instance
 * @param {string} customerId - Customer user ID
 * @param {object} headers - Customer auth headers
 * @param {object} data - Order data
 * @returns {Promise<object>} Order object
 */
async function createOrder(app, customerId, headers, data) {
  const orderData = {
    restaurantId: data.restaurantId,
    menuId: data.menuId,
    slotId: data.slotId,
    items: data.items || [
      { itemName: 'Item 1', quantity: 1, price: 100 },
      { itemName: 'Item 2', quantity: 2, price: 150 },
    ],
    deliveryAddress: data.deliveryAddress || '456 Customer Ave',
    notes: data.notes || '',
    ...data,
  };

  const response = await request(app)
    .post('/api/orders')
    .set(headers)
    .send(orderData);

  if (response.status !== 201) {
    throw new Error(`Failed to create order: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Get order details
 * @param {Express.app} app - Express app instance
 * @param {string} orderId - Order ID
 * @param {object} headers - Auth headers
 * @returns {Promise<object>} Order object
 */
async function getOrder(app, orderId, headers) {
  const response = await request(app)
    .get(`/api/orders/${orderId}`)
    .set(headers);

  if (response.status !== 200) {
    throw new Error(`Failed to get order: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Update order status (transitions)
 * @param {Express.app} app - Express app instance
 * @param {string} orderId - Order ID
 * @param {string} status - New status (confirmed, preparing, ready, delivered)
 * @param {object} headers - Auth headers
 * @returns {Promise<object>} Updated order object
 */
async function updateOrderStatus(app, orderId, status, headers) {
  const endpoint = `/api/orders/${orderId}/${status === 'confirmed' ? 'confirm' : status}`;

  const response = await request(app)
    .post(endpoint)
    .set(headers)
    .send({});

  if (response.status !== 200) {
    throw new Error(`Failed to update order status to ${status}: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Cancel an order
 * @param {Express.app} app - Express app instance
 * @param {string} orderId - Order ID
 * @param {object} headers - Auth headers
 * @param {string} reason - Cancellation reason (optional)
 * @returns {Promise<object>} Cancelled order object
 */
async function cancelOrder(app, orderId, headers, reason = 'Changed mind') {
  const response = await request(app)
    .post(`/api/orders/${orderId}/cancel`)
    .set(headers)
    .send({ reason });

  if (response.status !== 200) {
    throw new Error(`Failed to cancel order: ${response.body.message}`);
  }

  return response.body.data;
}

/**
 * Get all orders for current user
 * @param {Express.app} app - Express app instance
 * @param {object} headers - Auth headers
 * @returns {Promise<array>} Orders array
 */
async function listOrders(app, headers, filters = {}) {
  const queryString = new URLSearchParams(filters).toString();
  const url = `/api/orders${queryString ? `?${queryString}` : ''}`;

  const response = await request(app)
    .get(url)
    .set(headers);

  if (response.status !== 200) {
    throw new Error(`Failed to list orders: ${response.body.message}`);
  }

  return response.body.data;
}

// ============== DATA CLEANUP HELPERS ==============

/**
 * Clean all test data from database
 * @param {object} models - Sequelize models object containing all models
 * @returns {Promise<void>}
 */
async function cleanupAllData(models) {
  // Delete in reverse dependency order
  await models.Order?.destroy({ where: {}, force: true });
  await models.DeliverySlot?.destroy({ where: {}, force: true });
  await models.Menu?.destroy({ where: {}, force: true });
  await models.Restaurant?.destroy({ where: {}, force: true });
  await models.User?.destroy({ where: {}, force: true });
}

// ============== EXPORTS ==============

module.exports = {
  // Auth helpers
  registerAndLogin,
  getAuthHeaders,
  createUserWithRole,

  // Restaurant helpers
  createRestaurant,
  getRestaurant,
  approveRestaurant,
  rejectRestaurant,
  updateDeliverySettings,
  setupCompleteRestaurant,

  // Menu helpers
  createMenu,
  getMenu,
  publishMenu,
  archiveMenu,
  addDeliverySlots,
  setupCompleteMenu,

  // Order helpers
  createOrder,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  listOrders,

  // Cleanup
  cleanupAllData,
};
