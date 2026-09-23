import type { AxiosInstance } from 'axios';
import type { AuthResult, User } from './types';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  // Only roles the server allows for self-signup
  role?: 'customer' | 'restaurant_admin' | 'delivery_partner';
}

export const createAuthApi = (client: AxiosInstance) => ({
  login: async (email: string, password: string): Promise<AuthResult> =>
    (await client.post('/auth/login', { email, password })).data.data,

  register: async (input: RegisterInput): Promise<AuthResult> =>
    (await client.post('/auth/register', input)).data.data,

  me: async (): Promise<User> => (await client.get('/auth/me')).data.data.user,

  logout: async () => {
    await client.post('/auth/logout');
  },
});

export type AuthApi = ReturnType<typeof createAuthApi>;
