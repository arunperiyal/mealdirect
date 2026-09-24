import { Platform } from 'react-native';
import Constants from 'expo-constants';

const API_PORT = 3000;

/**
 * Where the backend is. EXPO_PUBLIC_API_URL wins when set (EAS builds always set it).
 * Otherwise, in development, the backend is on the computer the app was loaded from,
 * so the apps keep working when that computer's network address changes:
 * - in a browser: the page's own host
 * - in Expo Go or a dev build: the host of the Expo dev server
 * - otherwise: the emulator/simulator address of the host machine
 */
export const resolveApiUrl = (envUrl: string | undefined, port = API_PORT) => {
  if (envUrl) return envUrl.replace(/\/+$/, '');

  if (Platform.OS === 'web') {
    const { protocol, hostname } = globalThis.location ?? {};
    if (hostname) return `${protocol}//${hostname}:${port}`;
  }

  // "192.168.1.20:8081" while the app is loaded from `npx expo start`
  const devServerHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devServerHost) return `http://${devServerHost}:${port}`;

  // The Android emulator reaches the host machine at 10.0.2.2, not localhost
  return Platform.OS === 'android' ? `http://10.0.2.2:${port}` : `http://localhost:${port}`;
};
