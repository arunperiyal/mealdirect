import { resolveApiUrl } from '@mealdirect/shared';

// EXPO_PUBLIC_API_URL if set; in development, otherwise the computer the app was loaded from
export const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL);

// How often an active order's status is refreshed on the order screen
export const ORDER_POLL_MS = 5000;
