import { AxiosError, AxiosHeaders } from 'axios';
import { toApiError } from '../../api/client';
import { canRate } from '../orderStatus';
import { statementPeriods, validatePeriod } from '../statements';

jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));

describe('statement periods', () => {
  test('ready-made periods end today; last month is the whole month', () => {
    const periods = statementPeriods(new Date(2026, 2, 15)); // 15 March 2026
    expect(periods.map((p) => [p.key, p.from, p.to])).toEqual([
      ['this-month', '2026-03-01', '2026-03-15'],
      ['last-month', '2026-02-01', '2026-02-28'],
      ['last-3-months', '2026-01-01', '2026-03-15'],
      ['this-year', '2026-01-01', '2026-03-15'],
    ]);
    // January: last month is December of the year before
    expect(statementPeriods(new Date(2026, 0, 10))[1]).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });

  test('checks dates like the backend does', () => {
    expect(validatePeriod('2026-01-01', '2026-01-31')).toBeNull();
    expect(validatePeriod('2026-01-01', '2026-01-01')).toBeNull();
    expect(validatePeriod('1/1/2026', '2026-01-31')).toMatch(/start date/);
    expect(validatePeriod('2026-02-01', '2026-01-31')).toMatch(/before/);
    expect(validatePeriod('2024-01-01', '2025-06-01')).toMatch(/at most a year/);
  });
});

describe('ratings', () => {
  test('orders can be rated for 7 days after they arrive', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    expect(canRate({ status: 'delivered', deliveredAt: '2026-10-01T12:00:00Z' }, now)).toBe(true);
    expect(canRate({ status: 'picked_up', deliveredAt: '2026-09-29T12:00:00Z' }, now)).toBe(false);
    expect(canRate({ status: 'out_for_delivery', deliveredAt: null }, now)).toBe(false);
  });
});

describe('errors on text responses', () => {
  test('the backend message is read from a JSON string body', () => {
    const response = {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: JSON.stringify({ success: false, code: 'PERIOD_TOO_LONG', message: 'A statement covers at most a year' }),
    };
    const error = new AxiosError('fail', 'ERR_BAD_REQUEST', response.config, null, response);
    expect(toApiError(error)).toMatchObject({ code: 'PERIOD_TOO_LONG', message: 'A statement covers at most a year' });
  });
});
