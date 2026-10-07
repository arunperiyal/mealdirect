const { Op, fn, col } = require('sequelize');
const sequelize = require('../config/database');
const { Order, Rating, Restaurant, User } = require('../models');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// Customers rate an order, and can change their rating, for this long after it arrives
const RATING_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// What the restaurant, rider and admins see of a rating
const RATING_FIELDS = ['foodRating', 'foodComment', 'deliveryRating', 'deliveryComment', 'createdAt', 'updatedAt'];

const round1 = (n) => Math.round(n * 10) / 10;

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// Average and count of one kind of star rating ('foodRating' or 'deliveryRating') over `where`
const summarize = async (attribute, where, transaction) => {
  const column = Rating.rawAttributes[attribute].field;
  const row = await Rating.findOne({
    where: { ...where, [attribute]: { [Op.ne]: null } },
    attributes: [
      [fn('AVG', col(column)), 'average'],
      [fn('COUNT', col(column)), 'count'],
    ],
    raw: true,
    transaction,
  });
  const count = Number(row?.count || 0);
  return { average: count ? round1(Number(row.average)) : null, count };
};

// The restaurant's stars on listings come from its food ratings
const updateRestaurantAverage = async (restaurantId, transaction) => {
  const { average, count } = await summarize('foodRating', { restaurantId }, transaction);
  await Restaurant.update({ avgRating: average ?? 0, totalReviews: count }, { where: { id: restaurantId }, transaction });
};

const clean = (text) => (typeof text === 'string' && text.trim() ? text.trim() : null);

/**
 * The customer rates a delivered or picked-up order: the food, and the delivery when a
 * rider brought it. Rating again within the window replaces the earlier rating.
 */
const rateOrder = wrap(async (orderId, customerId, { foodRating, foodComment, deliveryRating, deliveryComment }) => {
  const order = await Order.findByPk(orderId);
  if (!order) throwError('NOT_FOUND', 'Order not found', 404);
  if (order.customerId !== customerId) throwError('FORBIDDEN', 'You do not own this order', 403);
  if (!['delivered', 'picked_up'].includes(order.status)) {
    throwError('NOT_DELIVERED', 'You can rate an order once it has arrived', 409);
  }
  const arrived = order.deliveredAt ?? order.updatedAt;
  if (Date.now() - new Date(arrived).getTime() > RATING_WINDOW_DAYS * DAY_MS) {
    throwError('RATING_CLOSED', `Orders can be rated for ${RATING_WINDOW_DAYS} days after they arrive`, 409);
  }
  if (deliveryRating != null && !order.riderId) {
    throwError('NO_RIDER', 'This order was not brought by a delivery partner', 400);
  }

  return sequelize.transaction(async (transaction) => {
    const values = {
      orderId,
      customerId,
      restaurantId: order.restaurantId,
      riderId: order.riderId,
      foodRating,
      foodComment: clean(foodComment),
      deliveryRating: order.riderId ? deliveryRating ?? null : null,
      deliveryComment: order.riderId && deliveryRating != null ? clean(deliveryComment) : null,
    };
    const existing = await Rating.findOne({ where: { orderId }, transaction });
    const rating = existing ? await existing.update(values, { transaction }) : await Rating.create(values, { transaction });
    await updateRestaurantAverage(order.restaurantId, transaction);
    return rating;
  });
});

/** A restaurant's food ratings: average, how many of each star, and recent comments (public) */
const restaurantRatings = wrap(async (restaurantId, { limit = 20 } = {}) => {
  const restaurant = await Restaurant.findByPk(restaurantId, { attributes: ['id'] });
  if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);

  const [summary, stars, recent] = await Promise.all([
    summarize('foodRating', { restaurantId }),
    Rating.findAll({
      where: { restaurantId },
      attributes: ['foodRating', [fn('COUNT', col('food_rating')), 'count']],
      group: ['foodRating'],
      raw: true,
    }),
    Rating.findAll({
      where: { restaurantId, foodComment: { [Op.ne]: null } },
      attributes: ['id', 'foodRating', 'foodComment', 'createdAt'],
      // First name only: these are public
      include: [{ model: User, paranoid: false, as: 'customer', attributes: ['firstName'] }],
      order: [['createdAt', 'DESC']],
      limit: Math.min(limit, 50),
    }),
  ]);

  const byStars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of stars) byStars[row.foodRating] = Number(row.count);
  return {
    ...summary,
    byStars,
    recent: recent.map((r) => ({
      id: r.id,
      rating: r.foodRating,
      comment: r.foodComment,
      name: r.customer?.firstName || 'Customer',
      createdAt: r.createdAt,
    })),
  };
});

/** A rider's delivery ratings: average and recent ones. Customers stay anonymous. */
const riderRatings = wrap(async (riderId, { limit = 20 } = {}) => {
  const [summary, recent] = await Promise.all([
    summarize('deliveryRating', { riderId }),
    Rating.findAll({
      where: { riderId, deliveryRating: { [Op.ne]: null } },
      attributes: ['id', 'orderId', 'deliveryRating', 'deliveryComment', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: Math.min(limit, 50),
    }),
  ]);
  return {
    ...summary,
    recent: recent.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      rating: r.deliveryRating,
      comment: r.deliveryComment,
      createdAt: r.createdAt,
    })),
  };
});

/** Average delivery rating per rider, for the admin's rider list: { [riderId]: { average, count } } */
const riderAverages = async (riderIds) => {
  if (!riderIds.length) return {};
  const rows = await Rating.findAll({
    where: { riderId: { [Op.in]: riderIds }, deliveryRating: { [Op.ne]: null } },
    attributes: ['riderId', [fn('AVG', col('delivery_rating')), 'average'], [fn('COUNT', col('delivery_rating')), 'count']],
    group: ['riderId'],
    raw: true,
  });
  return Object.fromEntries(rows.map((r) => [r.riderId, { average: round1(Number(r.average)), count: Number(r.count) }]));
};

module.exports = {
  rateOrder,
  restaurantRatings,
  riderRatings,
  riderAverages,
  RATING_FIELDS,
  RATING_WINDOW_DAYS,
};
