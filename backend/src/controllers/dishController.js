const { Op, fn, col, where } = require('sequelize');
const { Dish, Menu, Restaurant } = require('../models');
const { assertLimitsConsistent } = require('../lib/itemLimits');

/**
 * A restaurant's dish list ("My dishes"). Partners build a day's menu by picking from it.
 * Menus keep their own copy of each dish, so edits here apply to menus made afterwards.
 */

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const wrap = (fn_) => async (...args) => {
  try {
    return await fn_(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

const EDITABLE = ['name', 'description', 'price', 'maxPerOrder', 'maxPerDay'];

const assertOwner = async (restaurantId, userId) => {
  const restaurant = await Restaurant.findByPk(restaurantId, { attributes: ['id', 'ownerId'] });
  if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);
  if (restaurant.ownerId !== userId) throwError('FORBIDDEN', 'You do not own this restaurant', 403);
};

const findOwnedDish = async (dishId, userId) => {
  const dish = await Dish.findByPk(dishId);
  if (!dish) throwError('NOT_FOUND', 'Dish not found', 404);
  await assertOwner(dish.restaurantId, userId);
  return dish;
};

// Two dishes in the list can't share a name (ignoring case); removed dishes don't count
const assertNameFree = async (restaurantId, name, exceptId) => {
  const clash = await Dish.findOne({
    where: {
      restaurantId,
      archived: false,
      ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}),
      [Op.and]: [where(fn('lower', col('name')), name.trim().toLowerCase())],
    },
    attributes: ['id'],
  });
  if (clash) throwError('DISH_EXISTS', `You already have a dish called ${name.trim()}`, 409);
};

const pick = (source) =>
  Object.fromEntries(EDITABLE.filter((f) => source[f] !== undefined).map((f) => [f, source[f]]));

const listDishes = wrap(async (restaurantId, userId, { archived = false } = {}) => {
  await assertOwner(restaurantId, userId);
  return Dish.findAll({
    where: { restaurantId, archived },
    order: [[fn('lower', col('name')), 'ASC']],
  });
});

const createDish = wrap(async (restaurantId, userId, data) => {
  await assertOwner(restaurantId, userId);
  const values = { description: '', maxPerOrder: null, maxPerDay: null, ...pick(data) };
  assertLimitsConsistent(values);
  await assertNameFree(restaurantId, values.name);
  return Dish.create({ ...values, name: values.name.trim(), restaurantId });
});

const updateDish = wrap(async (dishId, userId, data) => {
  const dish = await findOwnedDish(dishId, userId);
  const changes = pick(data);
  if (changes.name !== undefined) {
    changes.name = changes.name.trim();
    await assertNameFree(dish.restaurantId, changes.name, dish.id);
  }
  Object.assign(dish, changes);
  assertLimitsConsistent(dish);
  await dish.save();
  return dish;
});

const setArchived = (archived) =>
  wrap(async (dishId, userId) => {
    const dish = await findOwnedDish(dishId, userId);
    if (!archived) await assertNameFree(dish.restaurantId, dish.name, dish.id);
    dish.archived = archived;
    await dish.save();
    return dish;
  });

const archiveDish = setArchived(true);
const restoreDish = setArchived(false);

/**
 * Fill the list from dishes already on this restaurant's menus: one dish per name
 * (ignoring case), using the newest menu's price and details. Names already in the
 * list, including removed ones, are left alone.
 */
const importFromMenus = wrap(async (restaurantId, userId) => {
  await assertOwner(restaurantId, userId);
  const [menus, existing] = await Promise.all([
    Menu.findAll({ where: { restaurantId }, attributes: ['items', 'date'], order: [['date', 'DESC']] }),
    Dish.findAll({ where: { restaurantId }, attributes: ['name'] }),
  ]);
  const taken = new Set(existing.map((d) => d.name.trim().toLowerCase()));
  const toCreate = [];
  for (const menu of menus) {
    for (const item of menu.items || []) {
      const key = String(item.name || '').trim().toLowerCase();
      if (!key || taken.has(key)) continue;
      taken.add(key);
      toCreate.push({
        restaurantId,
        name: item.name.trim(),
        description: item.description || '',
        price: item.price,
        maxPerOrder: item.maxPerOrder ?? null,
        maxPerDay: item.maxPerDay ?? null,
      });
    }
  }
  const created = toCreate.length ? await Dish.bulkCreate(toCreate) : [];
  return { imported: created.length, dishes: await listDishes(restaurantId, userId) };
});

/**
 * Menu items for dishes from the list: a copy of each dish, remembering which one it was.
 * `overrides` may change the price or availability for this menu only.
 */
const menuItemsFromDishes = async (restaurantId, requests) => {
  const ids = requests.map((r) => r.dishId);
  const dishes = await Dish.findAll({ where: { id: { [Op.in]: ids }, restaurantId, archived: false } });
  return requests.map(({ dishId, ...overrides }) => {
    const dish = dishes.find((d) => d.id === dishId);
    if (!dish) throwError('DISH_NOT_FOUND', 'That dish is not in your list', 404);
    return {
      dishId: dish.id,
      name: dish.name,
      description: dish.description || '',
      price: overrides.price !== undefined ? parseFloat(overrides.price) : parseFloat(dish.price),
      maxPerOrder: dish.maxPerOrder,
      maxPerDay: dish.maxPerDay,
      available: overrides.available !== false,
    };
  });
};

module.exports = {
  listDishes,
  createDish,
  updateDish,
  archiveDish,
  restoreDish,
  importFromMenus,
  menuItemsFromDishes,
};
