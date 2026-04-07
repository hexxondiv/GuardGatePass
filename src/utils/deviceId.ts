import * as SecureStore from 'expo-secure-store';
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

/**
 * Stable per-install id for `device_id` on verify (optional; used with offline sync in WS7).
 */
export async function getOrCreateDeviceId(): Promise<string | null> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
    if (existing?.trim()) {
      return existing.trim();
    }
    const next = `ggp_${randomId()}`;
    await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}
