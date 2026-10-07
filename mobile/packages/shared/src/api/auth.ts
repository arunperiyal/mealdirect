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

  // Profile picture: base64 JPEG, PNG or WebP. Both return the updated user.
  setAvatar: async (image: string): Promise<User> =>
    (await client.put('/auth/me/avatar', { image })).data.data.user,

  removeAvatar: async (): Promise<User> => (await client.delete('/auth/me/avatar')).data.data.user,

  // Forgot password: email a 6-digit code, then set a new password with it
  requestPasswordReset: async (email: string) => {
    await client.post('/auth/password-reset/request', { email });
  },
  confirmPasswordReset: async (input: { email: string; code: string; password: string }) => {
    await client.post('/auth/password-reset/confirm', input);
  },

  // Soft delete: the account can't sign in; MealDirect support can restore it
  deleteAccount: async (password: string) => {
    await client.delete('/auth/me', { data: { password } });
  },
});

export type AuthApi = ReturnType<typeof createAuthApi>;
