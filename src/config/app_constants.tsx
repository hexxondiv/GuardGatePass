import Constants from 'expo-constants';
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
const metroDevApiHost =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  typeof process !== 'undefined' &&
  process.env.EXPO_PUBLIC_DEV_API_BASE_URL
    ? String(process.env.EXPO_PUBLIC_DEV_API_BASE_URL).trim()
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

const apiHostBase =
  metroDevApiHost.length > 0
    ? metroDevApiHost
    : appConfig?.apiBaseUrl && appConfig.apiBaseUrl.length > 0
      ? appConfig.apiBaseUrl
      : appConfig?.devMode
        ? defaultDevApiBase
        : typeof __DEV__ !== 'undefined' && __DEV__
          ? defaultDevApiBase
          : 'https://gatepass.hexxondiv.com';

const API_BASE_URL = resolveApiBaseUrl(apiHostBase);

const PAYSTACK_CALLBACK_BASE_URL = appConfig?.paystackCallbackBaseUrl?.length
  ? resolvePaystackCallbackBase(appConfig.paystackCallbackBaseUrl)
  : resolvePaystackCallbackBase(apiHostBase);
const APP_SCHEME = 'com.hexxondiv.guardgatepass';

/** Placeholder endpoints — expanded in later workstreams. */
const API_ENDPOINTS = {
  LOGIN: `/login/`,
  GATEPASS_VERIFY: `/gatepass/verify`,
  GATEPASS_INSTANT_GUEST: `/gatepass/instant-guest`,
};

export { API_BASE_URL, API_ENDPOINTS, APP_SCHEME, PAYSTACK_CALLBACK_BASE_URL };
