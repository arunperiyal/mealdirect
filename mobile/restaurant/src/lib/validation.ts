// Client-side checks that mirror backend/src/routes/restaurants.js

export const validateRestaurantName = (name: string) =>
  name.trim().length >= 3 ? null : 'Name must be at least 3 characters';

// Optional; the server accepts any mobile number format
export const validatePhone = (phone: string) =>
  !phone.trim() || /^\+?[0-9 ]{10,15}$/.test(phone.trim()) ? null : 'Enter a valid phone number';

export const validateMoney = (value: string, label: string) => {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? null : `${label} must be 0 or more`;
};

// Optional per-dish limit: blank means no limit, otherwise a whole number from 1 to `max`
export const validateLimit = (value: string, max: number) => {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? null : `Enter a whole number from 1 to ${max}, or leave it blank`;
};

export const limitValue = (value: string) => (value.trim() ? Number(value) : null);
