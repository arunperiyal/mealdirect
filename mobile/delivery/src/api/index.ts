import { createApiClient, createAuthApi, session } from '@mealdirect/shared';
import { API_URL } from '@/config';

let sessionExpiredHandler = () => {};

// The store registers this at startup; kept as a setter to avoid an import cycle
export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

export const api = createApiClient({
  baseURL: API_URL,
  tokenStore: session,
  onSessionExpired: () => sessionExpiredHandler(),
});

export const authApi = createAuthApi(api);
