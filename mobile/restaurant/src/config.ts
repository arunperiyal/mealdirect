import { resolveApiUrl } from '@mealdirect/shared';

// EXPO_PUBLIC_API_URL if set; in development, otherwise the computer the app was loaded from
export const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL);

// How often the order screens check for new orders and status changes
export const ORDER_POLL_MS = 10000;
