import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'mealdirect.accessToken';
const REFRESH_KEY = 'mealdirect.refreshToken';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export const getAccessToken = () => SecureStore.getItemAsync(ACCESS_KEY);
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY);

export const setAccessToken = (token: string) => SecureStore.setItemAsync(ACCESS_KEY, token);

export const saveTokens = async ({ accessToken, refreshToken }: Tokens) => {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
};

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
};

// Cached profile so the app can open signed-in without a network round trip
const USER_KEY = 'mealdirect.user';

export const saveUser = (user: object) => SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

export const getUser = async <T>(): Promise<T | null> => {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const clearSession = async () => {
  await clearTokens();
  await SecureStore.deleteItemAsync(USER_KEY);
};
