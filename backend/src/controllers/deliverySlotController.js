const { DeliverySlot, Menu } = require('../models');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// 1. Create delivery slot for menu
const createDeliverySlot = async (menuId, restaurantId, data) => {
  try {
    const menu = await Menu.findByPk(menuId);
    if (!menu) throwError('NOT_FOUND', 'Menu not found', 404);
    if (menu.restaurantId !== restaurantId) {
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
const updateDeliverySlot = async (slotId, data) => {
  try {
    const slot = await DeliverySlot.findByPk(slotId);
    if (!slot) throwError('NOT_FOUND', 'Delivery slot not found', 404);

    const { startTime, endTime, maxOrders } = data;

    if (startTime) slot.startTime = startTime;
    if (endTime) slot.endTime = endTime;
    if (maxOrders) slot.maxOrders = parseInt(maxOrders);

    await slot.save();
    return slot;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 4. Delete delivery slot
const deleteDeliverySlot = async (slotId) => {
  try {
    const slot = await DeliverySlot.findByPk(slotId);
    if (!slot) throwError('NOT_FOUND', 'Delivery slot not found', 404);

    if (slot.currentOrders > 0) {
      throwError('CONFLICT', 'Cannot delete slot with active orders', 409);
    }

    const menu = await Menu.findByPk(slot.menuId);
    if (menu) {
      menu.deliverySlotIds = (menu.deliverySlotIds || []).filter((id) => id !== slotId);
      await menu.save();
    }

    await slot.destroy();
    return { message: 'Delivery slot deleted' };
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 5. Update slot capacity
const updateSlotCapacity = async (slotId, maxOrders) => {
  try {
    const slot = await DeliverySlot.findByPk(slotId);
    if (!slot) throwError('NOT_FOUND', 'Delivery slot not found', 404);

    const newMax = parseInt(maxOrders);
    if (newMax < slot.currentOrders) {
      throwError(
        'VALIDATION_ERROR',
        `Cannot reduce capacity below current orders (${slot.currentOrders})`,
        400
      );
    }

    slot.maxOrders = newMax;
    await slot.save();
    return slot;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 6. Get available slots for customer
const getAvailableSlots = async (restaurantId, date) => {
  try {
    const { Op } = require('sequelize');

    const slots = await DeliverySlot.findAll({
      include: [
        {
          model: Menu,
          as: 'menu',
          where: {
            restaurantId,
            date,
            status: 'published',
          },
          attributes: ['id', 'date'],
        },
      ],
      where: {
        [Op.and]: [
          {
            currentOrders: {
              [Op.lt]: sequelize.literal('`DeliverySlot`.`maxOrders`'),
            },
          },
        ],
      },
      order: [['startTime', 'ASC']],
    });

    return slots;
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 7. Reserve slot (increment currentOrders)
const reserveSlot = async (slotId) => {
  try {
    const slot = await DeliverySlot.findByPk(slotId);
    if (!slot) throwError('NOT_FOUND', 'Delivery slot not found', 404);

    if (slot.currentOrders >= slot.maxOrders) {
      throwError('SLOT_FULL', 'This delivery slot is full', 409);
    }

    slot.currentOrders += 1;
    await slot.save();

    return slot;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 8. Release slot (decrement currentOrders)
const releaseSlot = async (slotId) => {
  try {
    const slot = await DeliverySlot.findByPk(slotId);
    if (!slot) throwError('NOT_FOUND', 'Delivery slot not found', 404);

    if (slot.currentOrders > 0) {
      slot.currentOrders -= 1;
      await slot.save();
    }

    return slot;
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
  updateSlotCapacity,
  getAvailableSlots,
  reserveSlot,
  releaseSlot,
};
