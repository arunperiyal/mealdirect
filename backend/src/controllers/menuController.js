const { Menu, DeliverySlot, Restaurant } = require('../models');
const { v4: uuidv4 } = require('uuid');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// Helper: verify restaurant ownership
const verifyRestaurantOwnership = async (restaurantId, userId) => {
  const restaurant = await Restaurant.findByPk(restaurantId);
  if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);
  if (restaurant.ownerId !== userId) {
    throwError('FORBIDDEN', 'You do not own this restaurant', 403);
  }
  return restaurant;
};

// Helper: verify menu ownership via restaurant
const verifyMenuOwnership = async (menuId, userId) => {
  const menu = await Menu.findByPk(menuId);
  if (!menu) throwError('NOT_FOUND', 'Menu not found', 404);

  const restaurant = await verifyRestaurantOwnership(menu.restaurantId, userId);
  return { menu, restaurant };
};

// 1. Create menu (draft)
const createMenu = async (restaurantId, userId, data) => {
  try {
    await verifyRestaurantOwnership(restaurantId, userId);

    const { date, orderingStartTime, orderingEndTime } = data;

    if (!date) throwError('VALIDATION_ERROR', 'Date is required');

    const menu = await Menu.create({
      restaurantId,
      date,
      orderingStartTime,
      orderingEndTime,
      status: 'draft',
      items: [],
      deliverySlots: [],
    });

    return menu;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 2. Get menu by ID
const getMenu = async (menuId) => {
  try {
    const menu = await Menu.findByPk(menuId, {
      include: [
        {
          model: DeliverySlot,
          as: 'deliverySlots',
          attributes: ['id', 'startTime', 'endTime', 'maxOrders', 'currentOrders'],
        },
      ],
    });

    if (!menu) throwError('NOT_FOUND', 'Menu not found', 404);
    return menu;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 3. Update menu
const updateMenu = async (menuId, userId, data) => {
  try {
    const { menu } = await verifyMenuOwnership(menuId, userId);

    if (menu.status !== 'draft') {
      throwError('INVALID_STATUS', 'Can only edit draft menus');
    }

    const { date, orderingStartTime, orderingEndTime } = data;

    if (date) menu.date = date;
    if (orderingStartTime) menu.orderingStartTime = orderingStartTime;
    if (orderingEndTime) menu.orderingEndTime = orderingEndTime;

    await menu.save();
    return menu;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 4. Publish menu
const publishMenu = async (menuId, userId) => {
  try {
    const { menu } = await verifyMenuOwnership(menuId, userId);

    if (menu.status !== 'draft') {
      throwError('INVALID_STATUS', 'Can only publish draft menus');
    }

    if (!menu.items || menu.items.length === 0) {
      throwError('VALIDATION_ERROR', 'Menu must have at least one item before publishing');
    }

    menu.status = 'published';
    menu.publishedAt = new Date();
    menu.isActive = true;

    await menu.save();
    return menu;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 5. Close menu (stop accepting orders)
const closeMenu = async (menuId, userId) => {
  try {
    const { menu } = await verifyMenuOwnership(menuId, userId);

    if (menu.status === 'closed' || menu.status === 'archived') {
      throwError('INVALID_STATUS', 'Menu is already closed or archived');
    }

    menu.status = 'closed';
    menu.isActive = false;

    await menu.save();
    return menu;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 6. Get menus for specific date
const getMenusByDate = async (restaurantId, date) => {
  try {
    const menus = await Menu.findAll({
      where: { restaurantId, date },
      include: [
        {
          model: DeliverySlot,
          as: 'deliverySlots',
          attributes: ['id', 'startTime', 'endTime', 'maxOrders', 'currentOrders'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return menus;
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 7. Get menus by date range
const getMenusByRestaurant = async (restaurantId, startDate, endDate, limit = 50, offset = 0) => {
  try {
    const { Op } = require('sequelize');

    const { count, rows } = await Menu.findAndCountAll({
      where: {
        restaurantId,
        date: {
          [Op.between]: [startDate, endDate],
        },
      },
      limit: Math.min(limit, 100),
      offset,
      include: [
        {
          model: DeliverySlot,
          as: 'deliverySlots',
          attributes: ['id', 'startTime', 'endTime', 'maxOrders', 'currentOrders'],
        },
      ],
      order: [['date', 'DESC']],
    });

    return { count, rows };
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 8. Add menu items
const addMenuItems = async (menuId, userId, items) => {
  try {
    const { menu } = await verifyMenuOwnership(menuId, userId);

    if (!items || !Array.isArray(items) || items.length === 0) {
      throwError('VALIDATION_ERROR', 'Items array is required and must not be empty');
    }

    const newItems = items.map((item) => ({
      id: item.id || uuidv4(),
      name: item.name,
      description: item.description || '',
      price: parseFloat(item.price),
      imageUrl: item.imageUrl || '',
      available: item.available !== false,
    }));

    menu.items = [...(menu.items || []), ...newItems];
    await menu.save();

    return menu;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 9. Update specific item
const updateMenuItem = async (menuId, userId, itemId, data) => {
  try {
    const { menu } = await verifyMenuOwnership(menuId, userId);

    const itemIndex = menu.items.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) {
      throwError('NOT_FOUND', 'Menu item not found', 404);
    }

    const item = menu.items[itemIndex];
    if (data.name) item.name = data.name;
    if (data.description) item.description = data.description;
    if (data.price) item.price = parseFloat(data.price);
    if (data.imageUrl) item.imageUrl = data.imageUrl;
    if (data.available !== undefined) item.available = data.available;

    menu.items[itemIndex] = item;
    await menu.save();

    return menu;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 10. Remove menu item
const removeMenuItem = async (menuId, userId, itemId) => {
  try {
    const { menu } = await verifyMenuOwnership(menuId, userId);

    const itemIndex = menu.items.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) {
      throwError('NOT_FOUND', 'Menu item not found', 404);
    }

    menu.items = menu.items.filter((item) => item.id !== itemId);
    await menu.save();

    return menu;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

module.exports = {
  createMenu,
  getMenu,
  updateMenu,
  publishMenu,
  closeMenu,
  getMenusByDate,
  getMenusByRestaurant,
  addMenuItems,
  updateMenuItem,
  removeMenuItem,
};
