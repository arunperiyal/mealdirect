const { Op } = require('sequelize');
const { Order, Restaurant, User } = require('../models');
const { ORDER_DETAILS, addStatusHistory, completeDelivery } = require('./orderController');
const { recordCollection, riderCash } = require('./collectionController');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// A rider can be handling this many orders at once
const MAX_ACTIVE = 3;

// Orders a rider may claim: accepted by the restaurant, going out for delivery,
// not yet picked up
const CLAIMABLE_STATUSES = ['confirmed', 'preparing', 'ready'];
const ACTIVE_STATUSES = [...CLAIMABLE_STATUSES, 'out_for_delivery'];

const RESTAURANT = { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'address', 'city', 'phone'] };

// Where to pick up and where to drop off, for the rider handling the order
const DELIVERY_DETAILS = [...ORDER_DETAILS, RESTAURANT];

// Riders browsing the queue see only the customer's first name; the phone
// number appears once they've claimed the order
const QUEUE_DETAILS = [
  ...ORDER_DETAILS.filter((i) => i.as !== 'customer'),
  { model: User, as: 'customer', attributes: ['id', 'firstName'] },
  RESTAURANT,
];

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// Riders need an admin's approval; checked on every request, so suspending takes effect at once
const assertApprovedRider = wrap(async (userId) => {
  const rider = await User.findByPk(userId, { attributes: ['id', 'role', 'riderStatus'] });
  if (!rider || rider.role !== 'delivery_partner') throwError('FORBIDDEN', 'Not a delivery partner', 403);
  if (rider.riderStatus !== 'approved') {
    throwError(
      'RIDER_NOT_APPROVED',
      rider.riderStatus === 'suspended'
        ? 'Your account is suspended. Contact MealDirect support.'
        : 'Your account is waiting for approval',
      403
    );
  }
});

// 1. The shared queue: unclaimed delivery orders, ready ones first
const listAvailable = wrap(async () => {
  const orders = await Order.findAll({
    where: { deliveryType: 'delivery', riderId: null, status: { [Op.in]: CLAIMABLE_STATUSES } },
    include: QUEUE_DETAILS,
    order: [['createdAt', 'ASC']],
    limit: 50,
  });
  return orders.sort((a, b) => Number(b.status === 'ready') - Number(a.status === 'ready'));
});

// 2. This rider's deliveries, newest first
const listMine = wrap(async (riderId) =>
  Order.findAll({
    where: { riderId },
    include: DELIVERY_DETAILS,
    order: [['createdAt', 'DESC']],
    limit: 50,
  })
);

const findMine = async (orderId, riderId) => {
  const order = await Order.findByPk(orderId, { include: DELIVERY_DETAILS });
  if (!order) throwError('NOT_FOUND', 'Order not found', 404);
  if (order.riderId !== riderId) throwError('FORBIDDEN', 'This delivery is not yours', 403);
  return order;
};

// 3. One order: the rider's own, or one still in the queue
const getOrder = wrap(async (orderId, riderId) => {
  const found = await Order.findByPk(orderId, { attributes: ['id', 'riderId', 'deliveryType', 'status'] });
  if (!found) throwError('NOT_FOUND', 'Order not found', 404);
  if (found.riderId === riderId) return Order.findByPk(orderId, { include: DELIVERY_DETAILS });

  const inQueue = !found.riderId && found.deliveryType === 'delivery' && CLAIMABLE_STATUSES.includes(found.status);
  if (!inQueue) throwError('FORBIDDEN', 'This delivery is not yours', 403);
  return Order.findByPk(orderId, { include: QUEUE_DETAILS });
});

// 4. Claim. A single conditional UPDATE, so two riders can't both get the order.
const claim = wrap(async (orderId, riderId) => {
  // Cash from before today must be handed to MealDirect before taking more orders
  const cash = await riderCash(riderId);
  if (cash.overdue > 0) {
    throwError(
      'SETTLEMENT_OVERDUE',
      `Settle ₹${cash.overdue.toFixed(2)} of cash with MealDirect to accept new deliveries`,
      403
    );
  }

  const active = await Order.count({ where: { riderId, status: { [Op.in]: ACTIVE_STATUSES } } });
  if (active >= MAX_ACTIVE) {
    throwError('TOO_MANY_ACTIVE', `You can handle up to ${MAX_ACTIVE} deliveries at a time`, 409);
  }

  const [updated] = await Order.update(
    { riderId, claimedAt: new Date() },
    {
      where: {
        id: orderId,
        riderId: null,
        deliveryType: 'delivery',
        status: { [Op.in]: CLAIMABLE_STATUSES },
      },
    }
  );

  if (updated === 0) {
    const order = await Order.findByPk(orderId);
    if (!order) throwError('NOT_FOUND', 'Order not found', 404);
    if (order.riderId) throwError('ALREADY_CLAIMED', 'Another delivery partner took this order', 409);
    throwError('NOT_CLAIMABLE', 'This order is not available for delivery', 409);
  }
  return Order.findByPk(orderId, { include: DELIVERY_DETAILS });
});

// 5. Hand it back before pickup (e.g. the rider can't make it)
const release = wrap(async (orderId, riderId) => {
  const order = await findMine(orderId, riderId);
  if (!CLAIMABLE_STATUSES.includes(order.status)) {
    throwError('INVALID_STATUS', 'Only orders not yet picked up can be released', 400);
  }
  order.riderId = null;
  order.claimedAt = null;
  await order.save();
  return Order.findByPk(orderId, { include: DELIVERY_DETAILS });
});

// 6. Collected from the restaurant
const pickUp = wrap(async (orderId, riderId) => {
  const order = await findMine(orderId, riderId);
  if (order.status !== 'ready') {
    throwError('INVALID_STATUS', `The restaurant hasn't marked this order ready (status: ${order.status})`, 400);
  }
  order.status = 'out_for_delivery';
  addStatusHistory(order, 'out_for_delivery', riderId);
  await order.save();
  return order;
});

// 7. Handed to the customer. For pay-on-delivery orders the rider says how the
// customer paid: cash, UPI (to MealDirect), or not paid.
const deliver = wrap(async (orderId, riderId, { collection, note } = {}) => {
  const order = await findMine(orderId, riderId);
  if (order.status !== 'out_for_delivery') {
    throwError('INVALID_STATUS', `Pick up the order before delivering it (status: ${order.status})`, 400);
  }
  if (order.paymentMethod === 'cod') recordCollection(order, { collection, note }, riderId);
  completeDelivery(order, riderId);
  await order.save();
  return order;
});

// 8. This rider's cash position with MealDirect
const balance = wrap(async (riderId) => riderCash(riderId));

module.exports = { assertApprovedRider, listAvailable, listMine, getOrder, claim, release, pickUp, deliver, balance, MAX_ACTIVE };
