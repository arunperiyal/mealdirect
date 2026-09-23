const { businessDateString, businessDateTime } = require('./businessTime');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const hhmm = (time) => String(time).slice(0, 5);

/**
 * Orders close at the menu's ordering end time on the menu's day; menus for
 * past days take no orders. Earlier days are open, so tomorrow's meals can be
 * ordered today.
 */
const assertOrderingOpen = (menu, now = new Date()) => {
  const today = businessDateString(now);
  const menuDate = String(menu.date).slice(0, 10);
  if (menuDate < today) throwError('ORDERING_CLOSED', 'This menu is for a day that has passed', 409);
  if (menuDate === today && menu.orderingEndTime && now >= businessDateTime(menuDate, menu.orderingEndTime)) {
    throwError('ORDERING_CLOSED', `Orders for this menu closed at ${hhmm(menu.orderingEndTime)}`, 409);
  }
};

module.exports = { assertOrderingOpen };
