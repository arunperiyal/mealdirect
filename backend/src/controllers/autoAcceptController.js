const { Op } = require('sequelize');
const { AutoAcceptRule, DeliverySlot, Order, Restaurant, User } = require('../models');
const { riderCash } = require('./collectionController');
const { CLAIMABLE_STATUSES, ACTIVE_STATUSES } = require('./deliveryController');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const MAX_RULES = 10;

// Rules can fill a rider's bag beyond the 3 deliveries they may accept by hand (a mess
// rider's lunch round), up to a limit each rider chooses
const DEFAULT_AUTO_LIMIT = 10;
const MAX_AUTO_LIMIT = 20;
const autoLimit = (rider) => rider.autoAcceptLimit ?? DEFAULT_AUTO_LIMIT;

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

const RESTAURANT = { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'city'] };

const view = (rule) => ({
  id: rule.id,
  restaurantId: rule.restaurantId,
  restaurant: rule.restaurant ? { id: rule.restaurant.id, name: rule.restaurant.name, city: rule.restaurant.city } : null,
  startTime: rule.startTime,
  endTime: rule.endTime,
  enabled: rule.enabled,
  createdAt: rule.createdAt,
});

const findMine = async (id, riderId) => {
  const rule = await AutoAcceptRule.findOne({ where: { id, riderId }, include: [RESTAURANT] });
  if (!rule) throwError('NOT_FOUND', 'Rule not found', 404);
  return rule;
};

// Windows run within one day: 22:00-02:00 would need two rules
const assertWindow = (startTime, endTime) => {
  if (startTime >= endTime) throwError('INVALID_WINDOW', 'The end time must be after the start time', 400);
};

const assertDeliveringRestaurant = async (restaurantId) => {
  const restaurant = await Restaurant.findByPk(restaurantId, { attributes: ['id', 'isApproved', 'deliveryEnabled'] });
  if (!restaurant || !restaurant.isApproved) throwError('NOT_FOUND', 'Restaurant not found', 404);
  if (!restaurant.deliveryEnabled) throwError('NO_DELIVERY', 'This restaurant does not deliver', 400);
};

// ===== Matching orders to rules =====

const hhmm = (time) => String(time).slice(0, 5);

/**
 * Give claimable delivery orders to riders whose rules cover the restaurant and the
 * order's delivery time. Among matching riders, the one with the fewest active
 * deliveries gets it (ties: the older rule). Riders still need to be approved, under
 * their auto-accept limit and without overdue cash, and don't get orders they gave back.
 * Orders without a delivery time match no rule.
 *
 * restaurantId narrows the run to one restaurant (after it accepts orders).
 * Returns how many orders were assigned.
 */
const runAutoAssign = async ({ restaurantId } = {}) => {
  const rules = await AutoAcceptRule.findAll({
    where: { enabled: true, ...(restaurantId && { restaurantId }) },
    include: [{ model: User, as: 'rider', attributes: ['id', 'autoAcceptLimit'], where: { riderStatus: 'approved' } }],
    order: [['createdAt', 'ASC']],
  });
  if (!rules.length) return 0;

  const orders = await Order.findAll({
    where: {
      riderId: null,
      deliveryType: 'delivery',
      status: { [Op.in]: CLAIMABLE_STATUSES },
      deliverySlotId: { [Op.ne]: null },
      restaurantId: { [Op.in]: [...new Set(rules.map((r) => r.restaurantId))] },
    },
    include: [{ model: DeliverySlot, as: 'deliverySlot', attributes: ['startTime'] }],
    order: [['createdAt', 'ASC']],
  });
  if (!orders.length) return 0;

  // Each rider's load and cash, looked up once per run
  const riders = new Map();
  const riderState = async (riderId) => {
    if (!riders.has(riderId)) {
      const [active, cash] = await Promise.all([
        Order.count({ where: { riderId, status: { [Op.in]: ACTIVE_STATUSES } } }),
        riderCash(riderId),
      ]);
      riders.set(riderId, { active, blocked: cash.overdue > 0 });
    }
    return riders.get(riderId);
  };

  let assigned = 0;
  for (const order of orders) {
    const due = order.deliverySlot && hhmm(order.deliverySlot.startTime);
    if (!due) continue;
    const released = order.releasedRiderIds || [];
    const matching = rules.filter(
      (r) => r.restaurantId === order.restaurantId && r.startTime <= due && due < r.endTime && !released.includes(r.riderId)
    );

    let best = null;
    for (const rule of matching) {
      const state = await riderState(rule.riderId);
      if (state.blocked || state.active >= autoLimit(rule.rider)) continue;
      // Rules are oldest first, so a strict < keeps the older rule on a tie
      if (!best || state.active < best.state.active) best = { rule, state };
    }
    if (!best) continue;

    // The same guard as a rider claiming by hand: nobody else took it meanwhile
    const [updated] = await Order.update(
      { riderId: best.rule.riderId, claimedAt: new Date() },
      { where: { id: order.id, riderId: null, status: { [Op.in]: CLAIMABLE_STATUSES } } }
    );
    if (updated) {
      best.state.active += 1;
      assigned += 1;
    }
  }
  return assigned;
};

// ===== The rider's rules =====

const listRules = wrap(async (riderId) => {
  const rules = await AutoAcceptRule.findAll({ where: { riderId }, include: [RESTAURANT], order: [['createdAt', 'ASC']] });
  return rules.map(view);
});

const createRule = wrap(async (riderId, { restaurantId, startTime, endTime }) => {
  assertWindow(startTime, endTime);
  await assertDeliveringRestaurant(restaurantId);
  if ((await AutoAcceptRule.count({ where: { riderId } })) >= MAX_RULES) {
    throwError('TOO_MANY_RULES', `You can have up to ${MAX_RULES} rules. Remove one first.`, 409);
  }
  const rule = await AutoAcceptRule.create({ riderId, restaurantId, startTime, endTime });
  // Take matching orders that are already waiting
  await runAutoAssign({ restaurantId });
  return view(await findMine(rule.id, riderId));
});

const updateRule = wrap(async (id, riderId, { startTime, endTime, enabled }) => {
  const rule = await findMine(id, riderId);
  assertWindow(startTime ?? rule.startTime, endTime ?? rule.endTime);
  await rule.update({
    ...(startTime !== undefined && { startTime }),
    ...(endTime !== undefined && { endTime }),
    ...(enabled !== undefined && { enabled }),
  });
  if (rule.enabled) await runAutoAssign({ restaurantId: rule.restaurantId });
  return view(rule);
});

const deleteRule = wrap(async (id, riderId) => {
  await (await findMine(id, riderId)).destroy();
});

// ===== The rider's limit =====

const settingsView = (rider) => ({ limit: autoLimit(rider), maxLimit: MAX_AUTO_LIMIT, defaultLimit: DEFAULT_AUTO_LIMIT });

const getSettings = wrap(async (riderId) => settingsView(await User.findByPk(riderId, { attributes: ['id', 'autoAcceptLimit'] })));

const updateSettings = wrap(async (riderId, { limit }) => {
  const rider = await User.findByPk(riderId, { attributes: ['id', 'autoAcceptLimit'] });
  rider.autoAcceptLimit = limit;
  await rider.save();
  // A higher limit can take more of the orders already waiting
  await runAutoAssign();
  return settingsView(rider);
});

module.exports = {
  runAutoAssign,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  getSettings,
  updateSettings,
  MAX_RULES,
  DEFAULT_AUTO_LIMIT,
  MAX_AUTO_LIMIT,
};
