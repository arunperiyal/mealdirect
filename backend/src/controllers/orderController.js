const { Op } = require('sequelize');
const config = require('../config');
const { assertCustomerCanOrder, recordCollection } = require('./collectionController');
const { assertOrderingOpen } = require('../lib/ordering');
const { Order, Menu, DeliverySlot, Restaurant, User } = require('../models');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// Who ordered and when it's due. Only what the restaurant needs to fulfil the
// order: no email or account fields.
const ORDER_DETAILS = [
  { model: User, as: 'customer', attributes: ['id', 'firstName', 'lastName', 'phone'] },
  { model: User, as: 'rider', attributes: ['id', 'firstName', 'lastName', 'phone'] },
  { model: DeliverySlot, as: 'deliverySlot', attributes: ['id', 'startTime', 'endTime'] },
];

// Once a rider claims an order, the delivery steps are theirs
const assertNoRider = (order) => {
  if (order.riderId) {
    throwError('RIDER_ASSIGNED', 'A delivery partner is handling this order', 409);
  }
};

// Mark delivered. Payment on delivery is recorded separately (who collected it, how).
const completeDelivery = (order, userId) => {
  order.status = 'delivered';
  order.deliveredAt = new Date();
  addStatusHistory(order, 'delivered', userId);
};

// Helper: does this user own the restaurant the order belongs to?
const ownsOrderRestaurant = async (order, userId) => {
  const restaurant = await Restaurant.findByPk(order.restaurantId, { attributes: ['ownerId'] });
  return Boolean(restaurant) && restaurant.ownerId === userId;
};

// Helper: load an order that the restaurant admin must own
const findOwnedOrder = async (orderId, userId) => {
  const order = await Order.findByPk(orderId);
  if (!order) throwError('NOT_FOUND', 'Order not found', 404);
  if (!(await ownsOrderRestaurant(order, userId))) {
    throwError('FORBIDDEN', 'You do not own this order', 403);
  }
  return order;
};

// Helper: validate order access
const validateOrderAccess = async (orderId, userId, role) => {
  const order = await Order.findByPk(orderId, { include: ORDER_DETAILS });
  if (!order) throwError('NOT_FOUND', 'Order not found', 404);

  if (role === 'system_admin') return order;
  if (role === 'restaurant_admin') {
    if (!(await ownsOrderRestaurant(order, userId))) {
      throwError('FORBIDDEN', 'You do not have access to this order', 403);
    }
  } else if (role === 'customer') {
    if (order.customerId !== userId) {
      throwError('FORBIDDEN', 'You do not have access to this order', 403);
    }
  }
  return order;
};

// Helper: add status to history.
// Assign a new array: Sequelize doesn't detect in-place changes to JSON columns,
// so a push() would be silently dropped on save.
const addStatusHistory = (order, newStatus, userId) => {
  order.statusHistory = [
    ...(order.statusHistory || []),
    { status: newStatus, timestamp: new Date(), changedBy: userId },
  ];
};

// 1. Create order
const createOrder = async (customerId, data) => {
  try {
    const {
      restaurantId,
      menuId,
      items,
      deliveryType,
      deliverySlotId,
      deliveryAddress,
      paymentMethod,
      customerNotes,
    } = data;

    if (paymentMethod !== 'cod' && !config.payment.onlineEnabled) {
      throwError('ONLINE_PAYMENTS_DISABLED', 'Online payment is not available right now. Please pay on delivery.', 400);
    }
    await assertCustomerCanOrder(customerId);

    // Validate restaurant
    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);
    if (!restaurant.isApproved) {
      throwError('RESTAURANT_NOT_APPROVED', 'This restaurant is not yet approved', 403);
    }

    // Validate menu
    const menu = await Menu.findByPk(menuId);
    if (!menu) throwError('NOT_FOUND', 'Menu not found', 404);
    if (menu.restaurantId !== restaurantId) {
      throwError('VALIDATION_ERROR', 'Menu does not belong to this restaurant');
    }
    if (menu.status !== 'published') {
      throwError('MENU_NOT_PUBLISHED', 'Menu is not published', 409);
    }
    assertOrderingOpen(menu);

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      throwError('VALIDATION_ERROR', 'Items array is required');
    }

    let subtotal = 0;
    const orderItems = items.map((item) => {
      const menuItem = menu.items.find((mi) => mi.id === item.menuItemId);
      if (!menuItem) {
        throwError('ITEM_NOT_FOUND', `Menu item ${item.menuItemId} not found`, 404);
      }
      if (!menuItem.available) {
        throwError('ITEM_UNAVAILABLE', `Item ${menuItem.name} is not available`, 409);
      }

      const itemTotal = menuItem.price * item.quantity;
      subtotal += itemTotal;

      return {
        menuItemId: item.menuItemId,
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price,
        total: itemTotal,
      };
    });

    // Validate delivery slot
    let deliveryFee = 0;
    if (deliveryType === 'delivery') {
      if (!restaurant.deliveryEnabled) {
        throwError('DELIVERY_DISABLED', 'Restaurant does not offer delivery', 409);
      }
      if (!deliveryAddress) {
        throwError('VALIDATION_ERROR', 'Delivery address is required for delivery orders');
      }

      if (deliverySlotId) {
        const slot = await DeliverySlot.findByPk(deliverySlotId);
        if (!slot) throwError('NOT_FOUND', 'Delivery slot not found', 404);
        if (slot.currentOrders >= slot.maxOrders) {
          throwError('SLOT_FULL', 'This delivery slot is full', 409);
        }
      }

      // Postgres returns DECIMAL columns as strings; without Number() the
      // total below would concatenate ("300" + "30.00") instead of adding
      deliveryFee = Number(restaurant.defaultDeliveryFee) || 0;
    } else if (deliveryType === 'pickup') {
      if (!restaurant.pickupEnabled) {
        throwError('PICKUP_DISABLED', 'Restaurant does not offer pickup', 409);
      }
    } else {
      throwError('VALIDATION_ERROR', 'Invalid delivery type');
    }

    // Calculate totals
    const tax = subtotal * 0.05; // 5% tax
    const discount = 0; // TODO: add promo code support
    const total = subtotal + tax + deliveryFee - discount;

    // Restaurants with auto-accept take cash orders without a tap. Online
    // orders are accepted when their payment succeeds.
    const autoAccepted = paymentMethod === 'cod' && restaurant.autoAcceptOrders;

    // Create order
    const order = await Order.create({
      customerId,
      restaurantId,
      menuId,
      items: orderItems,
      deliveryType,
      deliverySlotId: deliveryType === 'delivery' ? deliverySlotId : null,
      deliveryAddress: deliveryType === 'delivery' ? deliveryAddress : null,
      paymentMethod,
      paymentStatus: 'pending',
      collectionStatus: paymentMethod === 'cod' ? 'awaiting' : null,
      subtotal,
      tax,
      deliveryFee,
      discount,
      total,
      status: autoAccepted ? 'confirmed' : 'pending',
      confirmedAt: autoAccepted ? new Date() : null,
      customerNotes,
      statusHistory: [
        {
          status: 'pending',
          timestamp: new Date(),
          changedBy: customerId,
        },
        ...(autoAccepted ? [{ status: 'confirmed', timestamp: new Date(), changedBy: 'system' }] : []),
      ],
    });

    // Reserve delivery slot
    if (deliverySlotId) {
      const slot = await DeliverySlot.findByPk(deliverySlotId);
      slot.currentOrders += 1;
      await slot.save();
    }

    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 2. Get order
const getOrder = async (orderId, userId, role) => {
  try {
    const order = await validateOrderAccess(orderId, userId, role);
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 3. List customer orders
const listCustomerOrders = async (customerId, filters = {}) => {
  try {
    const { status, limit = 20, offset = 0 } = filters;
    const where = { customerId };

    if (status) where.status = status;

    const { count, rows } = await Order.findAndCountAll({
      where,
      limit: Math.min(limit, 100),
      offset,
      order: [['createdAt', 'DESC']],
    });

    return { count, rows };
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 4. List orders for the restaurants a restaurant admin owns
const listRestaurantOrders = async (ownerId, filters = {}) => {
  try {
    const { status, restaurantId, limit = 20, offset = 0 } = filters;

    const owned = await Restaurant.findAll({ where: { ownerId }, attributes: ['id'] });
    const ownedIds = owned.map((r) => r.id);

    if (restaurantId && !ownedIds.includes(restaurantId)) {
      throwError('FORBIDDEN', 'You do not own this restaurant', 403);
    }

    const where = { restaurantId: restaurantId || { [Op.in]: ownedIds } };

    if (status) where.status = status;

    const { count, rows } = await Order.findAndCountAll({
      where,
      limit: Math.min(limit, 100),
      offset,
      order: [['createdAt', 'DESC']],
      include: ORDER_DETAILS,
      distinct: true,
    });

    return { count, rows };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 5. List admin orders
const listAdminOrders = async (filters = {}) => {
  try {
    const { status, restaurantId, customerId, limit = 20, offset = 0 } = filters;
    const where = {};

    if (status) where.status = status;
    if (restaurantId) where.restaurantId = restaurantId;
    if (customerId) where.customerId = customerId;
    if (filters.collection) where.collectionStatus = filters.collection;

    const { count, rows } = await Order.findAndCountAll({
      where,
      limit: Math.min(limit, 100),
      offset,
      order: [['createdAt', 'DESC']],
      include: [...ORDER_DETAILS, { model: Restaurant, as: 'restaurant', attributes: ['id', 'name'] }],
      distinct: true,
    });

    return { count, rows };
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 6. Confirm order
const confirmOrder = async (orderId, userId) => {
  try {
    const order = await findOwnedOrder(orderId, userId);

    if (order.status !== 'pending') {
      throwError(
        'INVALID_STATUS',
        `Cannot confirm order with status: ${order.status}`,
        400
      );
    }
    if (order.paymentMethod !== 'cod' && order.paymentStatus !== 'completed') {
      throwError('PAYMENT_PENDING', 'Order has not been paid yet', 409);
    }

    order.status = 'confirmed';
    order.confirmedAt = new Date();
    addStatusHistory(order, 'confirmed', userId);

    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 7. Mark preparing
const markPreparing = async (orderId, userId) => {
  try {
    const order = await findOwnedOrder(orderId, userId);

    if (order.status !== 'confirmed') {
      throwError(
        'INVALID_STATUS',
        `Cannot mark preparing from status: ${order.status}`,
        400
      );
    }

    order.status = 'preparing';
    addStatusHistory(order, 'preparing', userId);

    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 8. Mark ready
const markReady = async (orderId, userId) => {
  try {
    const order = await findOwnedOrder(orderId, userId);

    if (order.status !== 'preparing') {
      throwError('INVALID_STATUS', `Cannot mark ready from status: ${order.status}`, 400);
    }

    order.status = 'ready';
    order.readyAt = new Date();
    addStatusHistory(order, 'ready', userId);

    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 8b. Mark out for delivery (delivery orders only)
const markOutForDelivery = async (orderId, userId) => {
  try {
    const order = await findOwnedOrder(orderId, userId);

    if (order.deliveryType !== 'delivery') {
      throwError('INVALID_DELIVERY_TYPE', 'Pickup orders are not sent out for delivery', 400);
    }
    assertNoRider(order);
    if (order.status !== 'ready') {
      throwError(
        'INVALID_STATUS',
        `Cannot mark out for delivery from status: ${order.status}`,
        400
      );
    }

    order.status = 'out_for_delivery';
    addStatusHistory(order, 'out_for_delivery', userId);

    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 9. Mark delivered
const markDelivered = async (orderId, userId) => {
  try {
    const order = await findOwnedOrder(orderId, userId);
    assertNoRider(order);

    if (order.status !== 'out_for_delivery') {
      throwError(
        'INVALID_STATUS',
        `Cannot mark delivered from status: ${order.status}`,
        400
      );
    }

    completeDelivery(order, userId);

    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 10. Mark picked up
const markPickedUp = async (orderId, customerId, userId) => {
  try {
    const order = await Order.findByPk(orderId);
    if (!order) throwError('NOT_FOUND', 'Order not found', 404);
    if (order.customerId !== customerId) {
      throwError('FORBIDDEN', 'You do not own this order', 403);
    }

    if (order.status !== 'ready') {
      throwError('INVALID_STATUS', `Cannot mark picked up from status: ${order.status}`, 400);
    }

    order.status = 'picked_up';
    order.deliveredAt = new Date();
    addStatusHistory(order, 'picked_up', userId);

    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 10b. Restaurant records payment for a pickup or self-delivered cash order
const recordRestaurantPayment = async (orderId, userId, { collection, note }) => {
  try {
    const order = await findOwnedOrder(orderId, userId);
    if (order.paymentMethod !== 'cod') throwError('NOT_CASH_ORDER', 'This order was paid online', 409);
    if (order.riderId) throwError('RIDER_ASSIGNED', 'The delivery partner records payment for this order', 409);
    if (order.collectionStatus !== 'awaiting') {
      throwError('ALREADY_RECORDED', 'Payment for this order has already been recorded', 409);
    }
    const handedOver =
      order.deliveryType === 'pickup' ? ['ready', 'picked_up'].includes(order.status) : order.status === 'delivered';
    if (!handedOver) {
      throwError('INVALID_STATUS', 'Record payment when the customer receives the order', 400);
    }
    recordCollection(order, { collection, note }, userId);
    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 11. Cancel order
const cancelOrder = async (orderId, userId, role, reason = '') => {
  try {
    const order = await Order.findByPk(orderId);
    if (!order) throwError('NOT_FOUND', 'Order not found', 404);

    // Customer can only cancel if pending/confirmed
    if (role === 'customer') {
      if (order.customerId !== userId) {
        throwError('FORBIDDEN', 'You do not own this order', 403);
      }
      if (order.status !== 'pending' && order.status !== 'confirmed') {
        throwError('INVALID_STATUS', `Cannot cancel order with status: ${order.status}`, 400);
      }
    } else if (role === 'restaurant_admin') {
      if (!(await ownsOrderRestaurant(order, userId))) {
        throwError('FORBIDDEN', 'You do not own this order', 403);
      }
    } else if (role !== 'system_admin') {
      throwError('FORBIDDEN', 'You cannot cancel this order', 403);
    }

    // Release delivery slot
    if (order.deliverySlotId) {
      const slot = await DeliverySlot.findByPk(order.deliverySlotId);
      if (slot && slot.currentOrders > 0) {
        slot.currentOrders -= 1;
        await slot.save();
      }
    }

    order.status = 'cancelled';
    order.cancellationReason = reason;
    addStatusHistory(order, 'cancelled', userId);

    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 12. Update order
const updateOrder = async (orderId, userId, data) => {
  try {
    const order = await Order.findByPk(orderId);
    if (!order) throwError('NOT_FOUND', 'Order not found', 404);
    if (order.customerId !== userId) {
      throwError('FORBIDDEN', 'You do not own this order', 403);
    }

    if (order.status !== 'pending') {
      throwError(
        'INVALID_STATUS',
        'Can only edit pending orders',
        400
      );
    }

    const { customerNotes, deliveryAddress } = data;

    if (customerNotes) order.customerNotes = customerNotes;
    if (deliveryAddress && order.deliveryType === 'delivery') {
      order.deliveryAddress = deliveryAddress;
    }

    await order.save();
    return order;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

module.exports = {
  recordRestaurantPayment,
  ORDER_DETAILS,
  addStatusHistory,
  completeDelivery,
  createOrder,
  getOrder,
  listCustomerOrders,
  listRestaurantOrders,
  listAdminOrders,
  confirmOrder,
  markPreparing,
  markReady,
  markOutForDelivery,
  markDelivered,
  markPickedUp,
  cancelOrder,
  updateOrder,
};
