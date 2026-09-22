import { Platform } from 'react-native';

// The Android emulator reaches the host machine at 10.0.2.2, not localhost
const defaultHost = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || defaultHost).replace(/\/+$/, '');

export const BRAND_COLOR = '#E23744';

// How often an active order's status is refreshed on the order screen
export const ORDER_POLL_MS = 5000;
