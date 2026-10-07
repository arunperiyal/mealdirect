// Rider auto-accept rules: times are 24-hour HH:mm, and a window runs within one day
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// "9:30" -> "09:30"; anything else is left for the check to refuse
export const normalizeTime = (value: string) => {
  const t = value.trim();
  return /^\d:\d\d$/.test(t) ? `0${t}` : t;
};

// Mirrors the backend; null when the window is fine
export const validateWindow = (start: string, end: string) => {
  if (!TIME.test(start)) return 'Enter the start time like 12:00';
  if (!TIME.test(end)) return 'Enter the end time like 14:00';
  if (start >= end) return 'The end time must be after the start time';
  return null;
};
