const { Op } = require('sequelize');
const { Order, Settlement } = require('../models');
const { startOfBusinessDay } = require('../lib/businessTime');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const COLLECTIONS = ['cash', 'upi', 'not_paid'];
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Record what happened with a pay-on-delivery order's money.
 * collection: 'cash' | 'upi' (collected) or 'not_paid' (the customer didn't pay)
 */
const recordCollection = (order, { collection, note }, userId) => {
  if (!COLLECTIONS.includes(collection)) {
    throwError('COLLECTION_REQUIRED', 'Say how the customer paid: cash, UPI, or not paid', 400);
  }
  if (collection === 'not_paid') {
    order.collectionStatus = 'not_paid';
    order.collectionMethod = null;
    order.paymentStatus = 'failed';
  } else {
    order.collectionStatus = 'collected';
    order.collectionMethod = collection;
    order.paymentStatus = 'completed';
  }
  order.collectedById = userId;
  order.collectedAt = new Date();
  order.collectionNote = note?.trim() || null;
};

const sumTotals = async (where) => Number((await Order.sum('total', { where })) || 0);

/**
 * A delivery partner's cash position. Cash they collected is owed to MealDirect
 * until settled; cash from before today that isn't settled is overdue.
 */
const riderCash = async (riderId, now = new Date()) => {
  const collectedCash = { collectedById: riderId, collectionStatus: 'collected', collectionMethod: 'cash' };
  const today = startOfBusinessDay(now);

  const [cashAll, cashBeforeToday, cashToday, upiToday, settled] = await Promise.all([
    sumTotals(collectedCash),
    sumTotals({ ...collectedCash, collectedAt: { [Op.lt]: today } }),
    sumTotals({ ...collectedCash, collectedAt: { [Op.gte]: today } }),
    sumTotals({ collectedById: riderId, collectionStatus: 'collected', collectionMethod: 'upi', collectedAt: { [Op.gte]: today } }),
    Settlement.sum('amount', { where: { riderId } }).then((n) => Number(n || 0)),
  ]);

  return {
    balance: round2(Math.max(0, cashAll - settled)),
    overdue: round2(Math.max(0, cashBeforeToday - settled)),
    cashToday: round2(cashToday),
    upiToday: round2(upiToday),
    settled: round2(settled),
  };
};

// Customers with an unresolved unpaid order can't place new ones
const assertCustomerCanOrder = async (customerId) => {
  const unpaid = await Order.findOne({
    where: { customerId, collectionStatus: 'not_paid' },
    attributes: ['id', 'deliveredAt', 'createdAt'],
    order: [['createdAt', 'ASC']],
  });
  if (unpaid) {
    throwError(
      'PAYMENT_OVERDUE',
      'An earlier order is marked as not paid. Please contact MealDirect support to settle it before ordering again.',
      403
    );
  }
};

module.exports = { recordCollection, riderCash, assertCustomerCanOrder, startOfBusinessDay, COLLECTIONS, round2 };
