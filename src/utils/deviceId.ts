import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { DEVICE_ID_STORAGE_KEY } from '../config/app_constants';

function randomId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function resolveNewDeviceId(): Promise<string> {
  if (Platform.OS === 'android') {
    try {
      const aid = Application.getAndroidId();
      if (typeof aid === 'string' && aid.trim()) {
        return `and_${aid.trim()}`;
      }
    } catch {
      /* fall through */
    }
  }
  if (Platform.OS === 'ios') {
    try {
      const idfv = await Application.getIosIdForVendorAsync();
      if (typeof idfv === 'string' && idfv.trim()) {
        return `ios_${idfv.trim()}`;
      }
    } catch {
      /* fall through */
    }
  }
  return `ggp_${randomId()}`;
}

/**
 * Stable id for `device_id` on `POST /gatepass/verify` and guard sync (`schemas.GuardDeviceRegisterRequest`).
 * Prefers `expo-application` Android ID / iOS IDFV, else a persisted random id (SecureStore).
 */
export async function getOrCreateDeviceId(): Promise<string | null> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
    if (existing?.trim()) {
      return existing.trim();
    }
    const next = await resolveNewDeviceId();
    await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}

/** Read existing persisted device id without creating a new one. */
export async function getStoredDeviceId(): Promise<string | null> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
    return existing?.trim() || null;
  } catch {
    return null;
  }
}
