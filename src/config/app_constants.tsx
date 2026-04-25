import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const appConfig = (
  Constants.expoConfig?.extra as
    | {
        appConfig?: {
          apiBaseUrl?: string;
          paystackCallbackBaseUrl?: string;
          devMode?: boolean;
        };
      }
    | undefined
)?.appConfig;

/**
 * Inlined by Metro from `.env` — survives dev-client / `extra` cache issues better than `Constants.expoConfig` alone.
 * Set to the same host as `DEV_API_BASE_URL` (ngrok or LAN IP), no `/api/v1` suffix.
 */
const env = typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {};

const metroDevApiHost =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  typeof process !== 'undefined' &&
  env.EXPO_PUBLIC_DEV_API_BASE_URL
    ? String(env.EXPO_PUBLIC_DEV_API_BASE_URL).trim()
    : '';

/** Android emulator → host machine. iOS Simulator → host machine. Physical device needs DEV_API_BASE_URL (LAN IP). */
const defaultDevApiBase =
  Platform.OS === 'android' ? 'http://10.0.2.2:8001' : 'http://127.0.0.1:8001';

/**
 * Production host serves FastAPI at the **site root** (`/login/`, `/users/`, …).
 * Local uvicorn + ngrok also expose `/api/v1/...`; production does **not** — `/api/v1/login/` is 404 there.
 */
function isLegacyProductionHost(origin: string): boolean {
  return origin.includes('gatepass.hexxondiv.com');
}

function resolveApiBaseUrl(origin: string): string {
  const t = origin.trim().replace(/\/+$/, '');
  if (t.endsWith('/api/v1')) return t;
  if (isLegacyProductionHost(t)) return t;
  return `${t}/api/v1`;
}

function resolvePaystackCallbackBase(origin: string): string {
  const t = origin.trim().replace(/\/+$/, '');
  if (t.endsWith('/api/v1')) return t;
  if (isLegacyProductionHost(t)) return t;
  return `${t}/api/v1`;
}

/**
 * In dev (`__DEV__`), default to the machine-local API (emulator loopback) so we match
 * `gatepass-frontend` `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001` without requiring
 * `DEV_MODE=true`. If `DEV_MODE=false`, `app.config.js` still sets `extra.appConfig.apiBaseUrl`
 * to production — using that here would send the dev client to prod while admin hits localhost.
 * Override with `EXPO_PUBLIC_DEV_API_BASE_URL` (e.g. ngrok, LAN IP, or prod URL when testing prod).
 */
function getDefaultApiHostBaseSync(): string {
  return metroDevApiHost.length > 0
    ? metroDevApiHost
    : typeof __DEV__ !== 'undefined' && __DEV__
      ? defaultDevApiBase
      : appConfig?.apiBaseUrl && appConfig.apiBaseUrl.length > 0
        ? appConfig.apiBaseUrl
        : appConfig?.devMode
          ? defaultDevApiBase
          : 'https://gatepass.hexxondiv.com';
}

const API_BASE_URL = resolveApiBaseUrl(getDefaultApiHostBaseSync());

const PAYSTACK_CALLBACK_BASE_URL = appConfig?.paystackCallbackBaseUrl?.length
  ? resolvePaystackCallbackBase(appConfig.paystackCallbackBaseUrl)
  : resolvePaystackCallbackBase(getDefaultApiHostBaseSync());
const APP_SCHEME = 'com.hexxondiv.guardgatepass';

/**
 * SecureStore key for JWT — same as ResidentGatePass `userToken` so Bearer attachment stays consistent.
 */
const SECURE_ACCESS_TOKEN_KEY = 'userToken';

/**
 * Active estate id for `X-Estate-Id` — same key string as `gatepass-frontend` `ACTIVE_ESTATE_STORAGE_KEY`.
 */
const ACTIVE_ESTATE_STORAGE_KEY = 'active_estate_id';

/** Stable install id for `device_id` on verify / guard sync (Workstreams 4 & 7). */
const DEVICE_ID_STORAGE_KEY = 'guard_device_install_id';

/** When set, app behaves as offline for verify/sync even if the device has network (SecureStore: `1` / absent). */
const GUARD_FORCE_OFFLINE_MODE_KEY = 'guard_force_offline_mode';

/**
 * SecureStore key for the active estate's barrier webhook URL (received at login and refreshed on estate switch).
 * Value is the full URL string, or absent when not configured.
 */
const BARRIER_WEBHOOK_URL_KEY = 'barrier_webhook_url';

/**
 * Dev / staging API host override (host only, same rules as `EXPO_PUBLIC_DEV_API_BASE_URL`).
 * Applied at runtime via `refreshApiClientBaseUrl()` — Settings (gated) writes this key.
 */
const GUARD_DEV_API_HOST_OVERRIDE_KEY = 'guard_dev_api_host_override';

async function getEffectiveApiBaseUrlAsync(): Promise<string> {
  try {
    const raw = await SecureStore.getItemAsync(GUARD_DEV_API_HOST_OVERRIDE_KEY);
    const trimmed = raw?.trim();
    if (trimmed) {
      return resolveApiBaseUrl(trimmed);
    }
  } catch {
    /* SecureStore unavailable on some targets */
  }
  return API_BASE_URL;
}

const API_ENDPOINTS = {
  /** Staff login (guard / estate_admin / super_admin) — same path as admin web. */
  LOGIN_ADMIN: `/login/admin`,
  LOGIN: `/login/`,
  /** Current user — same as ResidentGatePass `GET_USER`; used for `id` as `guard_id` on verify payloads. */
  MY_PROFILE: `/users/my_profile`,
  ESTATES: `/estates/`,
  ESTATE: (id: number | string) => `/estates/${id}`,
  /** Estate members listing — same as `gatepass-frontend` `API_ENDPOINTS.ESTATE_MEMBERS`. */
  ESTATE_MEMBERS: (estateId: number | string) => `/estates/${estateId}/members`,
  GATEPASS_VERIFY: `/gatepass/verify`,
  /** Record gate use (OpenAPI `UseGatePass`) — optional; match admin web `recordGatePassAccess`. */
  GATEPASS_ACCESS: `/gatepass/access`,
  GATEPASS_INSTANT_GUEST: `/gatepass/instant-guest`,
  /** Under `/api/v1` alongside `gatepass` router — see `gatepass-api/app/main.py`. */
  ESTATE_CONFIG: (estateId: number | string) => `/estates/${estateId}/config`,
  GUARD_DEVICES_REGISTER: `/guard-devices/register`,
  GUARD_DEVICES_DEACTIVATE: `/guard-devices/deactivate`,
  GUARD_SYNC_BOOTSTRAP: `/guard-sync/bootstrap`,
  GUARD_SYNC_EVENTS: `/guard-sync/events`,
};

export {
  ACTIVE_ESTATE_STORAGE_KEY,
  API_BASE_URL,
  API_ENDPOINTS,
  APP_SCHEME,
  BARRIER_WEBHOOK_URL_KEY,
  DEVICE_ID_STORAGE_KEY,
  GUARD_DEV_API_HOST_OVERRIDE_KEY,
  GUARD_FORCE_OFFLINE_MODE_KEY,
  PAYSTACK_CALLBACK_BASE_URL,
  SECURE_ACCESS_TOKEN_KEY,
  getDefaultApiHostBaseSync,
  getEffectiveApiBaseUrlAsync,
};
