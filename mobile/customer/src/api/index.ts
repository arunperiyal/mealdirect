import { API_URL } from '@/config';
import { createApiClient } from './client';
import * as tokens from './tokens';
import type { AuthResult, User } from './types';

let sessionExpiredHandler = () => {};

// The store registers this at startup; kept as a setter to avoid an import cycle
export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

export const api = createApiClient({
  baseURL: API_URL,
  tokenStore: tokens,
  onSessionExpired: () => sessionExpiredHandler(),
});

export const authApi = {
  login: async (email: string, password: string): Promise<AuthResult> =>
    (await api.post('/auth/login', { email, password })).data.data,

  // Never send a role: the server defaults self-registration to 'customer'
  register: async (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<AuthResult> => (await api.post('/auth/register', input)).data.data,

  me: async (): Promise<User> => (await api.get('/auth/me')).data.data.user,

  logout: async () => {
    await api.post('/auth/logout');
  },
};

export { ApiError, toApiError } from './client';
