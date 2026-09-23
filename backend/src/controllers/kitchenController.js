const { Op } = require('sequelize');
const { Menu, Order, Restaurant, DeliverySlot } = require('../models');
const { ORDER_DETAILS, addStatusHistory } = require('./orderController');
const { businessDateTime } = require('../lib/businessTime');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

const assertOwner = async (restaurantId, userId) => {
  const restaurant = await Restaurant.findByPk(restaurantId, { attributes: ['id', 'ownerId'] });
  if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);
  if (restaurant.ownerId !== userId) throwError('FORBIDDEN', 'You do not own this restaurant', 403);
};

// Which kitchen group an order belongs to: a delivery slot, delivery without a slot, or pickup
const groupKey = (order) =>
  order.deliveryType === 'pickup' ? 'pickup' : order.deliverySlotId || 'unscheduled';

const dishTotals = (orders) => {
  const totals = new Map();
  for (const o of orders) {
    for (const item of o.items || []) {
      const t = totals.get(item.menuItemId) ?? { menuItemId: item.menuItemId, name: item.name, quantity: 0 };
      t.quantity += item.quantity;
      totals.set(item.menuItemId, t);
    }
  }
  return [...totals.values()].sort((a, b) => b.quantity - a.quantity);
};

const statusCounts = (orders) =>
  orders.reduce((c, o) => ({ ...c, [o.status]: (c[o.status] ?? 0) + 1 }), {});

/**
 * The day's cooking: dish totals across orders, and orders grouped by delivery
 * slot, delivery without a slot, and pickup.
 */
const getKitchen = wrap(async (userId, restaurantId, date) => {
  await assertOwner(restaurantId, userId);
  const menus = await Menu.findAll({
    where: { restaurantId, date },
    attributes: ['id', 'date', 'status', 'orderingEndTime'],
  });
  const orders = await Order.findAll({
    where: { menuId: menus.map((m) => m.id), status: { [Op.ne]: 'cancelled' } },
    include: ORDER_DETAILS,
    order: [['createdAt', 'ASC']],
  });

  const byKey = new Map();
  for (const o of orders) {
    const key = groupKey(o);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(o);
  }

  const groups = [...byKey.entries()].map(([key, list]) => {
    const slot = key === 'pickup' || key === 'unscheduled' ? null : list[0].deliverySlot;
    return {
      key,
      kind: key === 'pickup' ? 'pickup' : key === 'unscheduled' ? 'unscheduled' : 'slot',
      menuId: list[0].menuId,
      slot: slot ? { id: slot.id, startTime: slot.startTime, endTime: slot.endTime } : null,
      counts: statusCounts(list),
      dishTotals: dishTotals(list),
      orders: list,
    };
  });
  // Slots in time order, then delivery without a slot, then pickup
  const rank = (g) => (g.kind === 'slot' ? 0 : g.kind === 'unscheduled' ? 1 : 2);
  groups.sort((a, b) => rank(a) - rank(b) || String(a.slot?.startTime).localeCompare(String(b.slot?.startTime)));

  return { date, menus, totals: dishTotals(orders), counts: statusCounts(orders), groups };
});

/**
 * Move every order in a kitchen group forward at once.
 * accept: new orders -> accepted (skips online orders not yet paid)
 * ready:  accepted or preparing -> ready (skips "preparing")
 */
const bulkAdvance = wrap(async (userId, { menuId, group, action }) => {
  const menu = await Menu.findByPk(menuId, { attributes: ['id', 'restaurantId'] });
  if (!menu) throwError('NOT_FOUND', 'Menu not found', 404);
  await assertOwner(menu.restaurantId, userId);

  const where = { menuId, status: action === 'accept' ? 'pending' : { [Op.in]: ['confirmed', 'preparing'] } };
  if (group === 'pickup') where.deliveryType = 'pickup';
  else if (group === 'unscheduled') Object.assign(where, { deliveryType: 'delivery', deliverySlotId: null });
  else where.deliverySlotId = group;

  const orders = await Order.findAll({ where });
  let updated = 0;
  let skipped = 0;
  const now = new Date();
  for (const order of orders) {
    if (action === 'accept') {
      if (order.paymentMethod !== 'cod' && order.paymentStatus !== 'completed') {
        skipped += 1; // waiting for online payment
        continue;
      }
      order.status = 'confirmed';
      order.confirmedAt = now;
      addStatusHistory(order, 'confirmed', userId);
    } else {
      order.status = 'ready';
      order.readyAt = now;
      addStatusHistory(order, 'ready', userId);
    }
    await order.save();
    updated += 1;
  }
  return { updated, skipped };
});

/**
 * Scheduled auto-ready: accepted delivery orders become ready `autoReadyMinutes`
 * before their slot starts, for restaurants that turned it on.
 */
const runAutoReady = async (now = new Date()) => {
  const restaurants = await Restaurant.findAll({
    where: { autoReadyMinutes: { [Op.ne]: null } },
    attributes: ['id', 'autoReadyMinutes'],
    raw: true,
  });
  if (!restaurants.length) return 0;
  const minutes = new Map(restaurants.map((r) => [r.id, r.autoReadyMinutes]));

  const orders = await Order.findAll({
    where: {
      restaurantId: [...minutes.keys()],
      status: { [Op.in]: ['confirmed', 'preparing'] },
      deliveryType: 'delivery',
      deliverySlotId: { [Op.ne]: null },
    },
    include: [
      { model: DeliverySlot, as: 'deliverySlot', attributes: ['startTime'] },
      { model: Menu, as: 'menu', attributes: ['date'] },
    ],
  });

  let marked = 0;
  for (const order of orders) {
    if (!order.deliverySlot || !order.menu) continue;
    const slotStart = businessDateTime(String(order.menu.date).slice(0, 10), order.deliverySlot.startTime);
    const due = new Date(slotStart.getTime() - minutes.get(order.restaurantId) * 60 * 1000);
    if (now < due) continue;
    order.status = 'ready';
    order.readyAt = now;
    addStatusHistory(order, 'ready', 'system');
    await order.save();
    marked += 1;
  }
  return marked;
};

module.exports = { getKitchen, bulkAdvance, runAutoReady };
