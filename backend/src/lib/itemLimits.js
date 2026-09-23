// How much of one dish a customer may order. Restaurants set the limits per dish;
// null means no limit. Every order line is also capped at MAX_QUANTITY, which
// matches the customer app.
const MAX_QUANTITY = 20;
const MAX_DAILY_LIMIT = 100;

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// maxPerOrder above maxPerDay could never be reached
const assertLimitsConsistent = ({ name, maxPerOrder, maxPerDay }) => {
  if (maxPerOrder != null && maxPerDay != null && maxPerOrder > maxPerDay) {
    throwError(
      'INVALID_LIMITS',
      `${name ? `${name}: the` : 'The'} limit per order can't be more than the limit per day`,
      400
    );
  }
};

// Total quantity per dish, adding up repeated lines for the same dish
const quantitiesByItem = (items) => {
  const totals = new Map();
  for (const i of items) totals.set(i.menuItemId, (totals.get(i.menuItemId) ?? 0) + i.quantity);
  return totals;
};

/**
 * Check an order against each dish's limits.
 * `orderedBefore` is how much of each dish the customer already has in active
 * orders from this menu (the menu is one day's food).
 */
const assertWithinLimits = (menuItems, requested, orderedBefore) => {
  for (const [id, quantity] of requested) {
    const item = menuItems.find((mi) => mi.id === id);
    if (!item) continue;
    // Repeated lines for one dish can add up past the per-line cap
    const perOrder = Math.min(item.maxPerOrder ?? MAX_QUANTITY, MAX_QUANTITY);
    if (quantity > perOrder) {
      throwError('ITEM_LIMIT_PER_ORDER', `You can order up to ${perOrder} × ${item.name} per order`, 409);
    }
    if (item.maxPerDay != null) {
      const before = orderedBefore.get(id) ?? 0;
      if (before + quantity > item.maxPerDay) {
        const left = Math.max(item.maxPerDay - before, 0);
        throwError(
          'ITEM_LIMIT_PER_DAY',
          `${item.name} is limited to ${item.maxPerDay} per customer a day. ` +
            (left > 0 ? `You can add ${left} more.` : "You've already ordered that many."),
          409
        );
      }
    }
  }
};

module.exports = { MAX_QUANTITY, MAX_DAILY_LIMIT, assertLimitsConsistent, quantitiesByItem, assertWithinLimits };
