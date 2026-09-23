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
