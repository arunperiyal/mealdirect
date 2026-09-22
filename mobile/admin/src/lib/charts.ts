export interface DayPoint {
  date: string; // YYYY-MM-DD
  orders: number;
  revenue: number;
}

export interface Bucket extends DayPoint {
  label: string; // short axis label
  fullLabel: string; // for tooltips and the table
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const shortDate = (date: string) => {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

// A column per day up to a month; past that, days are too thin on a phone, so
// group into weeks. Weeks are anchored on the last day so the latest bucket ends today.
export const bucketForDisplay = (days: DayPoint[]): { unit: 'day' | 'week'; buckets: Bucket[] } => {
  if (days.length <= 31) {
    return {
      unit: 'day',
      buckets: days.map((d) => ({ ...d, label: shortDate(d.date), fullLabel: shortDate(d.date) })),
    };
  }
  const buckets: Bucket[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const week = days.slice(Math.max(0, end - 7), end);
    const first = week[0].date;
    const last = week[week.length - 1].date;
    buckets.unshift({
      date: first,
      orders: week.reduce((n, d) => n + d.orders, 0),
      revenue: week.reduce((n, d) => n + d.revenue, 0),
      label: shortDate(first),
      fullLabel: `${shortDate(first)} – ${shortDate(last)}`,
    });
  }
  return { unit: 'week', buckets };
};

// Round an axis maximum up to 1, 2, 2.5 or 5 × 10^n so ticks read cleanly
export const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= max)!;
  return step * magnitude;
};

const trim = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''));

// Indian compact units: thousand, lakh, crore
export const compactINR = (amount: number) => {
  const n = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (n >= 1e7) return `${sign}₹${trim(n / 1e7)}Cr`;
  if (n >= 1e5) return `${sign}₹${trim(n / 1e5)}L`;
  if (n >= 1e3) return `${sign}₹${trim(n / 1e3)}K`;
  return `${sign}₹${Math.round(n)}`;
};

export const compactCount = (n: number) => (n >= 1000 ? `${trim(n / 1000)}K` : String(n));

// Minutes east of UTC, which the analytics endpoint uses to group days
export const localTzOffset = () => -new Date().getTimezoneOffset();
