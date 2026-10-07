import { normalizeTime, validateWindow } from '../autoAccept';

describe('auto-accept windows', () => {
  test('accepts 24-hour windows within a day', () => {
    expect(validateWindow('12:00', '14:00')).toBeNull();
    expect(validateWindow(normalizeTime(' 9:30 '), '11:00')).toBeNull();
  });

  test('refuses bad times and windows that end before they start', () => {
    expect(validateWindow('2pm', '15:00')).toMatch(/start time/);
    expect(validateWindow('12:00', '24:00')).toMatch(/end time/);
    expect(validateWindow('14:00', '12:00')).toMatch(/after the start/);
    expect(validateWindow('22:00', '02:00')).toMatch(/after the start/);
  });
});
