const config = require('../config');

// The business runs on one timezone (India by default); menus and slots are
// stored as local dates and times in it.
const offsetMs = () => config.businessUtcOffsetMinutes * 60 * 1000;

// 'YYYY-MM-DD' for the business day containing `now`
const businessDateString = (now = new Date()) => new Date(now.getTime() + offsetMs()).toISOString().slice(0, 10);

// Midnight today in the business timezone, as a UTC instant
const startOfBusinessDay = (now = new Date()) => new Date(Date.parse(`${businessDateString(now)}T00:00:00Z`) - offsetMs());

// A menu date plus a local 'HH:mm' or 'HH:mm:ss' time, as a UTC instant
const businessDateTime = (date, time) => {
  const [h, m] = String(time).split(':').map(Number);
  const [y, mo, d] = String(date).split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - offsetMs());
};

module.exports = { businessDateString, startOfBusinessDay, businessDateTime };
