const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (email: string) =>
  !email.trim() ? 'Enter your email' : EMAIL.test(email.trim()) ? null : 'Enter a valid email';

// Matches the backend rule in routes/auth.js
export const validatePassword = (password: string) =>
  password.length >= 8 ? null : 'Password must be at least 8 characters';

export const validateRequired = (value: string, label: string) =>
  value.trim() ? null : `Enter your ${label}`;
