const { Address } = require('../models');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// Enough for home, work, family...; keeps the checkout list short
const MAX_ADDRESSES = 10;

const FIELDS = ['id', 'label', 'address', 'lastUsedAt', 'createdAt'];
const view = (a) => Object.fromEntries(FIELDS.map((f) => [f, a[f] ?? null]));

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

const findMine = async (id, userId) => {
  const address = await Address.findOne({ where: { id, userId } });
  if (!address) throwError('NOT_FOUND', 'Address not found', 404);
  return address;
};

/** Most recently used first, then newest */
const list = wrap(async (userId) => {
  const rows = await Address.findAll({ where: { userId } });
  const time = (d) => (d ? new Date(d).getTime() : 0);
  rows.sort((a, b) => time(b.lastUsedAt) - time(a.lastUsedAt) || time(b.createdAt) - time(a.createdAt));
  return rows.map(view);
});

const create = wrap(async (userId, { label, address }) => {
  if ((await Address.count({ where: { userId } })) >= MAX_ADDRESSES) {
    throwError('TOO_MANY_ADDRESSES', `You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`, 409);
  }
  return view(await Address.create({ userId, label, address }));
});

const update = wrap(async (id, userId, { label, address }) => {
  const saved = await findMine(id, userId);
  await saved.update({ ...(label !== undefined && { label }), ...(address !== undefined && { address }) });
  return view(saved);
});

const remove = wrap(async (id, userId) => {
  await (await findMine(id, userId)).destroy();
});

// After an order: the saved address it went to (same text) moves to the top
const markUsed = async (userId, deliveryAddress) => {
  if (!deliveryAddress) return;
  await Address.update({ lastUsedAt: new Date() }, { where: { userId, address: deliveryAddress.trim() } });
};

module.exports = { list, create, update, remove, markUsed, MAX_ADDRESSES };
