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

export const validateIfsc = (value: string) =>
  !value.trim() || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.trim().toUpperCase())
    ? null
    : 'IFSC is 11 characters, like HDFC0001234';

export const validateUpi = (value: string) =>
  !value.trim() || /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(value.trim()) ? null : 'UPI ID looks like name@bank';
