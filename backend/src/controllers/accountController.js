const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Order, Restaurant, User } = require('../models');
const { riderCash } = require('./collectionController');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// Accounts that can be deleted, by their owner or by an admin. MealDirect staff
// accounts are managed on the server.
const DELETABLE_ROLES = ['customer', 'restaurant_admin', 'delivery_partner'];

// Orders still on their way to the customer
const OPEN_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

/**
 * Deleting an account must not leave orders or money hanging. `self` words the
 * message for the user; otherwise for the admin.
 */
const assertCanDelete = async (user, self) => {
  const they = self ? 'you' : 'they';
  const their = self ? 'your' : 'their';

  if (user.role === 'customer') {
    const open = await Order.count({ where: { customerId: user.id, status: { [Op.in]: OPEN_STATUSES } } });
    if (open) {
      throwError('ACTIVE_ORDERS', `Wait until ${their} orders are delivered or cancelled`, 409);
    }
    const unpaid = await Order.count({ where: { customerId: user.id, collectionStatus: 'not_paid' } });
    if (unpaid) {
      throwError('PAYMENT_OVERDUE', `An order marked as not paid has to be settled first`, 409);
    }
  }

  if (user.role === 'delivery_partner') {
    const open = await Order.count({ where: { riderId: user.id, status: { [Op.in]: OPEN_STATUSES } } });
    if (open) {
      throwError('ACTIVE_DELIVERIES', `Deliver or release the orders ${they} have claimed first`, 409);
    }
    const { balance } = await riderCash(user.id);
    if (balance > 0) {
      throwError('CASH_NOT_SETTLED', `Settle the cash ${they} hold with MealDirect first`, 409);
    }
  }

  if (user.role === 'restaurant_admin') {
    const restaurants = await Restaurant.findAll({ where: { ownerId: user.id }, attributes: ['id'] });
    const open = restaurants.length
      ? await Order.count({
          where: { restaurantId: { [Op.in]: restaurants.map((r) => r.id) }, status: { [Op.in]: OPEN_STATUSES } },
        })
      : 0;
    if (open) {
      throwError('ACTIVE_ORDERS', `Finish or cancel ${their} restaurants' open orders first`, 409);
    }
  }
};

// Soft delete: the account can't sign in and drops out of every list, but its
// details and orders stay, so an admin can restore it. A partner's restaurants go with it.
const softDelete = async (user, deletedById) => {
  await sequelize.transaction(async (transaction) => {
    if (user.role === 'restaurant_admin') {
      await Restaurant.destroy({ where: { ownerId: user.id }, transaction });
    }
    user.deletedById = deletedById;
    await user.save({ transaction });
    await user.destroy({ transaction });
  });
};

/** The signed-in user deletes their own account, confirming with their password */
const deleteOwnAccount = wrap(async (userId, password) => {
  const user = await User.findByPk(userId);
  if (!user) throwError('NOT_FOUND', 'Account not found', 404);
  if (!DELETABLE_ROLES.includes(user.role)) {
    throwError('FORBIDDEN', 'MealDirect staff accounts are removed on the server', 403);
  }
  if (!(await user.comparePassword(password || ''))) {
    // Not 401: the apps take a 401 on a signed-in request to mean the session has ended
    throwError('INVALID_PASSWORD', 'That password is not right', 403);
  }
  await assertCanDelete(user, true);
  await softDelete(user, user.id);
});

/** An admin deletes a customer's, partner's or rider's account */
const deleteUser = wrap(async (userId, adminId) => {
  const user = await User.findByPk(userId);
  if (!user) throwError('NOT_FOUND', 'User not found', 404);
  if (!DELETABLE_ROLES.includes(user.role)) {
    throwError('FORBIDDEN', 'MealDirect staff accounts are removed on the server, not here', 403);
  }
  await assertCanDelete(user, false);
  await softDelete(user, adminId);
});

/** An admin brings a deleted account back, with a partner's restaurants */
const restoreUser = wrap(async (userId) => {
  const user = await User.findByPk(userId, { paranoid: false });
  if (!user || !DELETABLE_ROLES.includes(user.role)) throwError('NOT_FOUND', 'User not found', 404);
  if (!user.deletedAt) throwError('NOT_DELETED', 'This account is not deleted', 400);

  await sequelize.transaction(async (transaction) => {
    await user.restore({ transaction });
    user.deletedById = null;
    await user.save({ transaction });
    if (user.role === 'restaurant_admin') {
      // Restaurants are only ever deleted with their owner's account
      await Restaurant.restore({ where: { ownerId: user.id }, transaction });
    }
  });
  return user;
});

module.exports = { deleteOwnAccount, deleteUser, restoreUser, DELETABLE_ROLES };
