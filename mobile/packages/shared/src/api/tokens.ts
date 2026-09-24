import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'mealdirect.accessToken';
const REFRESH_KEY = 'mealdirect.refreshToken';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

// Phones keep the session in the OS keychain/keystore. Browsers have no equivalent,
// so the web apps use localStorage: the session survives reloads, and signing out clears it.
const storage =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
        setItemAsync: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
        deleteItemAsync: async (key: string) => globalThis.localStorage?.removeItem(key),
      }
    : SecureStore;

export const getAccessToken = () => storage.getItemAsync(ACCESS_KEY);
export const getRefreshToken = () => storage.getItemAsync(REFRESH_KEY);

export const setAccessToken = (token: string) => storage.setItemAsync(ACCESS_KEY, token);

export const saveTokens = async ({ accessToken, refreshToken }: Tokens) => {
  await storage.setItemAsync(ACCESS_KEY, accessToken);
  await storage.setItemAsync(REFRESH_KEY, refreshToken);
};

export const clearTokens = async () => {
  await storage.deleteItemAsync(ACCESS_KEY);
  await storage.deleteItemAsync(REFRESH_KEY);
};

// Cached profile so the app can open signed-in without a network round trip
const USER_KEY = 'mealdirect.user';

export const saveUser = (user: object) => storage.setItemAsync(USER_KEY, JSON.stringify(user));

export const getUser = async <T>(): Promise<T | null> => {
  const raw = await storage.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const clearSession = async () => {
  await clearTokens();
  await storage.deleteItemAsync(USER_KEY);
};
