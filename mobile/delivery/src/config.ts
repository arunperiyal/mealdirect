import { Platform } from 'react-native';

// The Android emulator reaches the host machine at 10.0.2.2, not localhost
const defaultHost = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || defaultHost).replace(/\/+$/, '');

// How often the order queue and deliveries refresh while open
export const ORDER_POLL_MS = 15000;
