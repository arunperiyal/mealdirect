import { resolveApiUrl } from '@mealdirect/shared';

// EXPO_PUBLIC_API_URL if set; in development, otherwise the computer the app was loaded from
export const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL);

// How often the order queue and deliveries refresh while open
export const ORDER_POLL_MS = 15000;
