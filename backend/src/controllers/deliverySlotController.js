const sequelize = require('../config/database');
const { DeliverySlot, Menu, Restaurant } = require('../models');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// Helper: the menu must belong to a restaurant this user owns
const verifyMenuOwnership = async (menuId, userId) => {
  const menu = await Menu.findByPk(menuId);
  if (!menu) throwError('NOT_FOUND', 'Menu not found', 404);
  const restaurant = await Restaurant.findByPk(menu.restaurantId, { attributes: ['ownerId'] });
  if (!restaurant || restaurant.ownerId !== userId) {
    throwError('FORBIDDEN', 'You do not own this menu', 403);
  }
  return menu;
};

// Helper: load a slot whose menu this user owns. In a transaction the row is
// locked, so orders taking a place in it wait until the change is saved.
const findOwnedSlot = async (slotId, userId, transaction) => {
  const slot = await DeliverySlot.findByPk(slotId, transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {});
  if (!slot) throwError('NOT_FOUND', 'Delivery slot not found', 404);
  await verifyMenuOwnership(slot.menuId, userId);
  return slot;
};

// 1. Create delivery slot for menu. restaurantId is optional and, if sent,
// must match the menu's restaurant.
const createDeliverySlot = async (menuId, userId, data) => {
  try {
    const menu = await verifyMenuOwnership(menuId, userId);
    const restaurantId = menu.restaurantId;
    if (data.restaurantId && data.restaurantId !== restaurantId) {
      throwError('FORBIDDEN', 'Menu does not belong to this restaurant', 403);
    }

    const { startTime, endTime, maxOrders } = data;

    if (!startTime || !endTime || !maxOrders) {
      throwError('VALIDATION_ERROR', 'startTime, endTime, and maxOrders are required');
    }

    const slot = await DeliverySlot.create({
      menuId,
      restaurantId,
      startTime,
      endTime,
      maxOrders: parseInt(maxOrders),
      currentOrders: 0,
    });

    menu.deliverySlotIds = [...(menu.deliverySlotIds || []), slot.id];
    await menu.save();

    return slot;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 2. Get delivery slots for menu
const getDeliverySlots = async (menuId) => {
  try {
    const slots = await DeliverySlot.findAll({
      where: { menuId },
      order: [['startTime', 'ASC']],
    });

    return slots;
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 3. Update delivery slot
const updateDeliverySlot = async (slotId, userId, data) => {
  try {
    return await sequelize.transaction(async (transaction) => {
      const slot = await findOwnedSlot(slotId, userId, transaction);

      const { startTime, endTime, maxOrders } = data;

      if (startTime) slot.startTime = startTime;
      if (endTime) slot.endTime = endTime;
      if (maxOrders) {
        const newMax = parseInt(maxOrders);
        if (newMax < slot.currentOrders) {
          throwError(
            'VALIDATION_ERROR',
            `Cannot reduce capacity below current orders (${slot.currentOrders})`,
            400
          );
        }
        slot.maxOrders = newMax;
      }

      await slot.save({ transaction });
      return slot;
    });
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 4. Delete delivery slot
const deleteDeliverySlot = async (slotId, userId) => {
  try {
    return await sequelize.transaction(async (transaction) => {
      const slot = await findOwnedSlot(slotId, userId, transaction);

      if (slot.currentOrders > 0) {
        throwError('CONFLICT', 'Cannot delete slot with active orders', 409);
      }

      const menu = await Menu.findByPk(slot.menuId, { transaction });
      if (menu) {
        menu.deliverySlotIds = (menu.deliverySlotIds || []).filter((id) => id !== slotId);
        await menu.save({ transaction });
      }

      await slot.destroy({ transaction });
      return { message: 'Delivery slot deleted' };
    });
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

module.exports = {
  createDeliverySlot,
  getDeliverySlots,
  updateDeliverySlot,
  deleteDeliverySlot,
};
