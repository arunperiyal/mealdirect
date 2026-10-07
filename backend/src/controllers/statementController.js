const { Op } = require('sequelize');
const { Order, Restaurant, User } = require('../models');
const { businessDateTime, businessDateTimeString } = require('../lib/businessTime');
const { toCsv } = require('../lib/csv');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// A statement covers at most a year
const MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS = {
  pending: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
};

const money = (n) => Math.round(Number(n || 0) * 100) / 100;
const orderNo = (id) => id.slice(0, 8).toUpperCase();
const items = (order) => (order.items || []).map((i) => `${i.quantity} x ${i.name}`).join('; ');
const fullName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ');

const payment = (order) => {
  if (order.paymentMethod !== 'cod') {
    return order.paymentStatus === 'completed' ? 'Paid online' : 'Online, not paid';
  }
  switch (order.collectionStatus) {
    case 'collected':
      return order.collectionMethod === 'upi' ? 'UPI' : 'Cash';
    case 'not_paid':
      return 'Not paid';
    case 'written_off':
      return 'Written off';
    default:
      return order.status === 'cancelled' ? '' : 'Pay on delivery';
  }
};

/** from/to are business days, both included; returns the UTC instants [start, end) */
const period = (from, to) => {
  const start = businessDateTime(from, '00:00');
  const end = new Date(businessDateTime(to, '00:00').getTime() + DAY_MS);
  if (end <= start) throwError('INVALID_PERIOD', 'The end date is before the start date', 400);
  if (end - start > MAX_DAYS * DAY_MS) throwError('PERIOD_TOO_LONG', 'A statement covers at most a year', 400);
  return { [Op.gte]: start, [Op.lt]: end };
};

// The money columns of the orders that weren't cancelled
const totalsRow = (orders, label, width, pick) => {
  const kept = orders.filter((o) => o.status !== 'cancelled');
  return [label, ...Array(width).fill(''), ...pick.map((field) => money(kept.reduce((sum, o) => sum + Number(o[field] || 0), 0)))];
};

const customerStatement = async (userId, when) => {
  const orders = await Order.findAll({
    where: { customerId: userId, createdAt: when },
    include: [{ model: Restaurant, paranoid: false, as: 'restaurant', attributes: ['name'] }],
    order: [['createdAt', 'ASC']],
  });
  return [
    ['Date', 'Order', 'Restaurant', 'Items', 'Delivery or pickup', 'Status', 'Subtotal', 'Delivery fee', 'Discount', 'Total', 'Payment'],
    ...orders.map((o) => [
      businessDateTimeString(o.createdAt),
      orderNo(o.id),
      o.restaurant?.name ?? '',
      items(o),
      o.deliveryType === 'pickup' ? 'Pickup' : 'Delivery',
      STATUS[o.status],
      money(o.subtotal),
      money(o.deliveryFee),
      money(o.discount),
      money(o.total),
      payment(o),
    ]),
    totalsRow(orders, 'Total (not counting cancelled orders)', 5, ['subtotal', 'deliveryFee', 'discount', 'total']),
  ];
};

const restaurantStatement = async (userId, when, restaurantId) => {
  const owned = await Restaurant.findAll({ where: { ownerId: userId }, attributes: ['id'] });
  const ids = owned.map((r) => r.id);
  if (restaurantId && !ids.includes(restaurantId)) throwError('FORBIDDEN', 'You do not own this restaurant', 403);

  const orders = await Order.findAll({
    where: { restaurantId: restaurantId || { [Op.in]: ids }, createdAt: when },
    include: [
      { model: Restaurant, paranoid: false, as: 'restaurant', attributes: ['name'] },
      { model: User, paranoid: false, as: 'customer', attributes: ['firstName', 'lastName'] },
      { model: User, paranoid: false, as: 'collectedBy', attributes: ['firstName', 'lastName', 'role'] },
    ],
    order: [['createdAt', 'ASC']],
  });
  return [
    [
      'Date', 'Order', 'Restaurant', 'Customer', 'Items', 'Delivery or pickup', 'Status',
      'Subtotal', 'Delivery fee', 'Discount', 'Total', 'Payment', 'Collected by',
    ],
    ...orders.map((o) => [
      businessDateTimeString(o.createdAt),
      orderNo(o.id),
      o.restaurant?.name ?? '',
      fullName(o.customer),
      items(o),
      o.deliveryType === 'pickup' ? 'Pickup' : 'Delivery',
      STATUS[o.status],
      money(o.subtotal),
      money(o.deliveryFee),
      money(o.discount),
      money(o.total),
      payment(o),
      o.collectedBy ? (o.collectedBy.role === 'delivery_partner' ? `${fullName(o.collectedBy)} (rider)` : 'Restaurant') : '',
    ]),
    totalsRow(orders, 'Total (not counting cancelled orders)', 6, ['subtotal', 'deliveryFee', 'discount', 'total']),
  ];
};

// Riders: the orders they delivered, by when they delivered them
const riderStatement = async (userId, when) => {
  const orders = await Order.findAll({
    where: { riderId: userId, status: 'delivered', deliveredAt: when },
    include: [{ model: Restaurant, paranoid: false, as: 'restaurant', attributes: ['name'] }],
    order: [['deliveredAt', 'ASC']],
  });
  const collected = (method) =>
    money(orders.filter((o) => o.collectionStatus === 'collected' && o.collectionMethod === method && o.collectedById === userId)
      .reduce((sum, o) => sum + Number(o.total), 0));
  return [
    ['Delivered', 'Order', 'Restaurant', 'Order total', 'Delivery fee', 'Payment'],
    ...orders.map((o) => [
      businessDateTimeString(o.deliveredAt),
      orderNo(o.id),
      o.restaurant?.name ?? '',
      money(o.total),
      money(o.deliveryFee),
      payment(o),
    ]),
    totalsRow(orders, `Total: ${orders.length} deliver${orders.length === 1 ? 'y' : 'ies'}`, 2, ['total', 'deliveryFee']),
    [`Cash you collected: ${collected('cash')}`],
    [`UPI paid to restaurants: ${collected('upi')}`],
  ];
};

/**
 * One user's orders from `from` to `to` (business days, 'YYYY-MM-DD', both included) as CSV.
 * Customers: orders they placed. Partners: their restaurants' orders (one, with restaurantId).
 * Riders: orders they delivered.
 */
const buildStatement = async (user, { from, to, restaurantId }) => {
  try {
    const when = period(from, to);
    const rows =
      user.role === 'customer'
        ? await customerStatement(user.id, when)
        : user.role === 'restaurant_admin'
          ? await restaurantStatement(user.id, when, restaurantId)
          : user.role === 'delivery_partner'
            ? await riderStatement(user.id, when)
            : throwError('FORBIDDEN', 'Statements are for customers, restaurants and riders', 403);
    return { csv: toCsv(rows), fileName: `mealdirect-orders-${from}-to-${to}.csv` };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

module.exports = { buildStatement, MAX_DAYS };
