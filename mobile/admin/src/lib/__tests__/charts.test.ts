import { bucketForDisplay, compactCount, compactINR, niceMax, shortDate, type DayPoint } from '../charts';

const days = (n: number): DayPoint[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 5, 1 + i));
    return { date: d.toISOString().slice(0, 10), orders: 1, revenue: 100 };
  });

describe('bucketForDisplay', () => {
  test('keeps one column per day up to a month', () => {
    const { unit, buckets } = bucketForDisplay(days(30));
    expect(unit).toBe('day');
    expect(buckets).toHaveLength(30);
    expect(buckets[0].label).toBe('1 Jun');
  });

  test('groups longer ranges into weeks, the last one ending on the last day', () => {
    const { unit, buckets } = bucketForDisplay(days(90));
    expect(unit).toBe('week');
    expect(buckets).toHaveLength(13); // 12 full weeks + a 6-day first bucket
    expect(buckets.at(-1)!.fullLabel).toBe('23 Aug – 29 Aug');
    expect(buckets[0].orders).toBe(6);
    expect(buckets.reduce((n, b) => n + b.orders, 0)).toBe(90);
    expect(buckets.reduce((n, b) => n + b.revenue, 0)).toBe(9000);
  });
});

describe('number formatting', () => {
  test('niceMax rounds up to readable axis maximums', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(237)).toBe(250);
    expect(niceMax(4100)).toBe(5000);
  });

  test('compactINR uses Indian units', () => {
    expect(compactINR(850)).toBe('₹850');
    expect(compactINR(1250)).toBe('₹1.3K');
    expect(compactINR(45000)).toBe('₹45K');
    expect(compactINR(250000)).toBe('₹2.5L');
    expect(compactINR(32000000)).toBe('₹3.2Cr');
  });

  test('compactCount and shortDate', () => {
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1500)).toBe('1.5K');
    expect(shortDate('2026-09-23')).toBe('23 Sep');
  });
});
