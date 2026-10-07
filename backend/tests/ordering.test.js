const { assertOrderingOpen, checkOrderingWindow } = require('../src/lib/ordering');
const { businessDateTime } = require('../src/lib/businessTime');

// The ordering window on its own, at chosen moments (business timezone)
describe('Ordering window', () => {
  const at = (date, time) => businessDateTime(date, time);
  const outcome = (menu, now) => {
    try {
      assertOrderingOpen(menu, now);
      return 'open';
    } catch (e) {
      return e.code;
    }
  };

  test('overnight: opens 20:00 the day before, closes 06:00 on the menu day', () => {
    const menu = { date: '2026-10-08', orderingStartTime: '20:00:00', orderingOpensDay: -1, orderingEndTime: '06:00:00', orderingClosesDay: 0 };
    expect(outcome(menu, at('2026-10-07', '19:59'))).toBe('ORDERING_NOT_OPEN');
    expect(outcome(menu, at('2026-10-07', '20:00'))).toBe('open');
    expect(outcome(menu, at('2026-10-08', '05:59'))).toBe('open');
    expect(outcome(menu, at('2026-10-08', '06:00'))).toBe('ORDERING_CLOSED');
  });

  test('closing the day before, e.g. lunch orders by 22:00 the night before', () => {
    const menu = { date: '2026-10-08', orderingStartTime: '08:00', orderingOpensDay: -1, orderingEndTime: '22:00', orderingClosesDay: -1 };
    expect(outcome(menu, at('2026-10-07', '21:59'))).toBe('open');
    let message;
    try {
      assertOrderingOpen(menu, at('2026-10-07', '22:00'));
    } catch (e) {
      message = e.message;
    }
    expect(message).toBe('Orders for this menu closed at 22:00 the day before');
  });

  test("menus from before overnight windows don't enforce the opening time", () => {
    const menu = { date: '2026-10-08', orderingStartTime: '07:00', orderingOpensDay: null, orderingEndTime: '10:00', orderingClosesDay: null };
    expect(outcome(menu, at('2026-10-07', '12:00'))).toBe('open');
    expect(outcome(menu, at('2026-10-08', '10:00'))).toBe('ORDERING_CLOSED');
  });

  test('without times, a menu is open until its day ends', () => {
    const menu = { date: '2026-10-08' };
    expect(outcome(menu, at('2026-10-08', '23:59'))).toBe('open');
    expect(outcome(menu, at('2026-10-09', '00:00'))).toBe('ORDERING_CLOSED');
  });

  test('a window must close after it opens; the menu day is the default for each end', () => {
    expect(checkOrderingWindow({ orderingStartTime: '20:00', orderingOpensDay: -1, orderingEndTime: '06:00' })).toEqual({
      orderingOpensDay: -1,
      orderingClosesDay: 0,
    });
    expect(checkOrderingWindow({ orderingEndTime: '10:00' })).toEqual({ orderingOpensDay: null, orderingClosesDay: 0 });
    expect(checkOrderingWindow({})).toEqual({ orderingOpensDay: null, orderingClosesDay: null });
    for (const bad of [
      { orderingStartTime: '20:00', orderingEndTime: '06:00' },
      { orderingStartTime: '08:00', orderingOpensDay: 0, orderingEndTime: '22:00', orderingClosesDay: -1 },
      { orderingStartTime: '10:00', orderingEndTime: '10:00' },
    ]) {
      expect(() => checkOrderingWindow(bad)).toThrow(expect.objectContaining({ code: 'INVALID_ORDERING_WINDOW' }));
    }
  });
});
