const { Op } = require('sequelize');
const { Order, Restaurant, User } = require('../models');
const { searchWhere } = require('./restaurantController');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const OWNER = { model: User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] };
const DAY_MS = 24 * 60 * 60 * 1000;

const countByStatus = async () => {
  const rows = await Restaurant.findAll({
    attributes: ['verificationStatus', [Restaurant.sequelize.fn('COUNT', Restaurant.sequelize.col('id')), 'count']],
    group: ['verificationStatus'],
    raw: true,
  });
  const counts = { pending: 0, verified: 0, rejected: 0 };
  for (const row of rows) counts[row.verificationStatus] = Number(row.count);
  return counts;
};

// 1. All restaurants, by review status
const listRestaurants = async ({ status, search, limit = 50, offset = 0 }) => {
  try {
    const where = {};
    if (status) where.verificationStatus = status;
    if (search) Object.assign(where, searchWhere(search));

    const { count, rows } = await Restaurant.findAndCountAll({
      where,
      include: [OWNER],
      limit: Math.min(limit, 100),
      offset,
      // Oldest first when reviewing, so nobody waits longest
      order: [['createdAt', status === 'pending' ? 'ASC' : 'DESC']],
      distinct: true,
    });

    return { count, rows, counts: await countByStatus() };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// Sales = total of orders that weren't cancelled
const summarize = (orders) => {
  const live = orders.filter((o) => o.status !== 'cancelled');
  const revenue = live.reduce((sum, o) => sum + Number(o.total), 0);
  return {
    orders: orders.length,
    cancelled: orders.length - live.length,
    revenue,
    averageOrderValue: live.length ? revenue / live.length : 0,
  };
};

// 2. One restaurant with its owner and order stats
const getRestaurant = async (restaurantId) => {
  try {
    const restaurant = await Restaurant.findByPk(restaurantId, { include: [OWNER] });
    if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);

    const orders = await Order.findAll({
      where: { restaurantId },
      attributes: ['total', 'status', 'createdAt'],
      order: [['createdAt', 'DESC']],
      raw: true,
    });
    const since = new Date(Date.now() - 30 * DAY_MS);

    return {
      restaurant,
      stats: {
        ...summarize(orders),
        last30Days: summarize(orders.filter((o) => new Date(o.createdAt) >= since)),
        lastOrderAt: orders[0]?.createdAt ?? null,
      },
    };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 3. Platform analytics for the last `days` days, bucketed by day in the
// admin's timezone (tzOffset = minutes east of UTC, e.g. 330 for IST).
// Aggregates in memory: fine at MVP volumes; move to SQL GROUP BY when order
// counts grow.
const getAnalytics = async ({ days, tzOffset = 0, now = new Date() }) => {
  try {
    const offsetMs = tzOffset * 60 * 1000;
    const localDay = (date) => new Date(new Date(date).getTime() + offsetMs).toISOString().slice(0, 10);

    // Midnight (admin's time) at the start of the first day, as a UTC instant
    const todayStart = Date.parse(`${localDay(now)}T00:00:00Z`) - offsetMs;
    const from = new Date(todayStart - (days - 1) * DAY_MS);

    const orders = await Order.findAll({
      where: { createdAt: { [Op.gte]: from } },
      attributes: ['restaurantId', 'customerId', 'total', 'status', 'createdAt'],
      raw: true,
    });
    const live = orders.filter((o) => o.status !== 'cancelled');

    const byDay = Array.from({ length: days }, (_, i) => ({
      date: localDay(new Date(from.getTime() + i * DAY_MS)),
      orders: 0,
      revenue: 0,
    }));
    const dayIndex = new Map(byDay.map((d, i) => [d.date, i]));
    for (const o of live) {
      const i = dayIndex.get(localDay(o.createdAt));
      if (i === undefined) continue;
      byDay[i].orders += 1;
      byDay[i].revenue += Number(o.total);
    }

    const perRestaurant = new Map();
    const perCustomer = new Map();
    for (const o of live) {
      const r = perRestaurant.get(o.restaurantId) ?? { orders: 0, revenue: 0 };
      r.orders += 1;
      r.revenue += Number(o.total);
      perRestaurant.set(o.restaurantId, r);
      perCustomer.set(o.customerId, (perCustomer.get(o.customerId) ?? 0) + 1);
    }

    const topIds = [...perRestaurant.entries()]
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(([id]) => id);
    const names = new Map(
      (await Restaurant.findAll({ where: { id: topIds }, attributes: ['id', 'name'], raw: true })).map((r) => [
        r.id,
        r.name,
      ])
    );

    const roleRows = await User.findAll({
      attributes: ['role', [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']],
      group: ['role'],
      raw: true,
    });
    const roles = Object.fromEntries(roleRows.map((r) => [r.role, Number(r.count)]));

    return {
      range: { from: byDay[0].date, to: byDay[byDay.length - 1].date, days },
      totals: {
        ...summarize(orders),
        customers: perCustomer.size,
        repeatCustomers: [...perCustomer.values()].filter((n) => n > 1).length,
      },
      byDay,
      topRestaurants: topIds.map((id) => ({ id, name: names.get(id) ?? 'Unknown', ...perRestaurant.get(id) })),
      restaurants: await countByStatus(),
      users: { customers: roles.customer ?? 0, partners: roles.restaurant_admin ?? 0, admins: roles.system_admin ?? 0 },
    };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 4. Delivery partners by status, with how many deliveries each has completed
const RIDER_FIELDS = ['id', 'email', 'firstName', 'lastName', 'phone', 'riderStatus', 'createdAt'];

const listRiders = async ({ status }) => {
  try {
    const where = { role: 'delivery_partner' };
    if (status) where.riderStatus = status;

    const riders = await User.findAll({ where, attributes: RIDER_FIELDS, order: [['createdAt', 'ASC']], raw: true });
    const delivered = await Order.findAll({
      where: { riderId: riders.map((r) => r.id), status: 'delivered' },
      attributes: ['riderId'],
      raw: true,
    });
    const counts = { pending: 0, approved: 0, suspended: 0 };
    const statusRows = await User.findAll({
      where: { role: 'delivery_partner' },
      attributes: ['riderStatus', [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']],
      group: ['riderStatus'],
      raw: true,
    });
    for (const row of statusRows) if (row.riderStatus in counts) counts[row.riderStatus] = Number(row.count);

    return {
      riders: riders.map((r) => ({ ...r, deliveries: delivered.filter((o) => o.riderId === r.id).length })),
      counts,
    };
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 5. Approve or suspend a delivery partner
const setRiderStatus = async (riderId, riderStatus) => {
  try {
    const rider = await User.findOne({ where: { id: riderId, role: 'delivery_partner' } });
    if (!rider) throwError('NOT_FOUND', 'Delivery partner not found', 404);
    rider.riderStatus = riderStatus;
    await rider.save();
    const { id, email, firstName, lastName, phone } = rider;
    return { id, email, firstName, lastName, phone, riderStatus };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

module.exports = { listRestaurants, getRestaurant, getAnalytics, listRiders, setRiderStatus };
