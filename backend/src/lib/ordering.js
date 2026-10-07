const { businessDateString, businessDateTime } = require('./businessTime');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const hhmm = (time) => String(time).slice(0, 5);
const minutes = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
};

// 'YYYY-MM-DD' moved by whole days
const shiftDate = (date, days) =>
  new Date(Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * A menu's ordering window. Each end is a time on the menu's day (0) or the day before
 * (-1), so ordering can run overnight: opens 20:00 the day before, closes 06:00.
 * - Opening: enforced only with orderingOpensDay set. Menus from before overnight
 *   windows (orderingOpensDay null) and menus without an opening time are open early.
 * - Closing: orderingClosesDay null means the menu's day.
 */
const orderingWindow = (menu) => {
  const date = String(menu.date).slice(0, 10);
  return {
    opensAt:
      menu.orderingStartTime && menu.orderingOpensDay != null
        ? businessDateTime(shiftDate(date, menu.orderingOpensDay), menu.orderingStartTime)
        : null,
    closesAt: menu.orderingEndTime
      ? businessDateTime(shiftDate(date, menu.orderingClosesDay ?? 0), menu.orderingEndTime)
      : null,
  };
};

const dayWords = (offset) => (offset === -1 ? ' the day before' : '');

/**
 * Orders are taken from the opening to the closing time; menus for past days take
 * none. Without a closing time, a menu is open until its day ends.
 */
const assertOrderingOpen = (menu, now = new Date()) => {
  const menuDate = String(menu.date).slice(0, 10);
  if (menuDate < businessDateString(now)) {
    throwError('ORDERING_CLOSED', 'This menu is for a day that has passed', 409);
  }
  const { opensAt, closesAt } = orderingWindow(menu);
  if (closesAt && now >= closesAt) {
    throwError(
      'ORDERING_CLOSED',
      `Orders for this menu closed at ${hhmm(menu.orderingEndTime)}${dayWords(menu.orderingClosesDay)}`,
      409
    );
  }
  if (opensAt && now < opensAt) {
    throwError(
      'ORDERING_NOT_OPEN',
      `Orders for this menu open at ${hhmm(menu.orderingStartTime)} on ${shiftDate(menuDate, menu.orderingOpensDay)}`,
      409
    );
  }
};

/**
 * The window a restaurant sets: the opening must come before the closing. Returns the
 * values to save, with the day of each end filled in (the menu's day unless given).
 */
const ORDERING_DAYS = [-1, 0];
const checkOrderingWindow = ({ orderingStartTime, orderingOpensDay, orderingEndTime, orderingClosesDay }) => {
  const opensDay = orderingStartTime ? orderingOpensDay ?? 0 : null;
  const closesDay = orderingEndTime ? orderingClosesDay ?? 0 : null;
  if (
    orderingStartTime &&
    orderingEndTime &&
    opensDay * 24 * 60 + minutes(orderingStartTime) >= closesDay * 24 * 60 + minutes(orderingEndTime)
  ) {
    throwError(
      'INVALID_ORDERING_WINDOW',
      'Ordering must close after it opens. For overnight ordering, open it the day before.',
      400
    );
  }
  return { orderingOpensDay: opensDay, orderingClosesDay: closesDay };
};

module.exports = { assertOrderingOpen, orderingWindow, checkOrderingWindow, ORDERING_DAYS, shiftDate };
