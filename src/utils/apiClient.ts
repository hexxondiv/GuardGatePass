/**
 * Shared Axios instance for authenticated API calls.
 *
 * - **Base URL**: `API_BASE_URL` from `app_constants` (host + `/api/v1` when applicable).
 * - **ngrok**: sets `ngrok-skip-browser-warning` when the base URL host contains `ngrok`.
 * - **Auth**: `Authorization: Bearer <token>` from SecureStore (`SECURE_ACCESS_TOKEN_KEY`).
 * - **Tenancy**: `X-Estate-Id` from the request if set; otherwise from SecureStore
 *   (`ACTIVE_ESTATE_STORAGE_KEY`), which `AuthProvider` keeps in sync when the user selects an estate.
 *   Per-call override: pass `headers: { 'X-Estate-Id': '<id>' }`.
 * - **401** (non-login): clears token + active estate and notifies `sessionEvents` (no refresh; backend has no refresh flow).
 */
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import {
  ACTIVE_ESTATE_STORAGE_KEY,
  API_BASE_URL,
  SECURE_ACCESS_TOKEN_KEY,
} from '../config/app_constants';
import { notifySessionUnauthorized } from '../auth/sessionEvents';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const base = config.baseURL || API_BASE_URL;
  if (typeof base === 'string' && base.includes('ngrok')) {
    config.headers['ngrok-skip-browser-warning'] = 'true';
  }
  const token = await SecureStore.getItemAsync(SECURE_ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const headers = config.headers;
  const explicitEstate =
    headers['X-Estate-Id'] ??
    headers['x-estate-id'] ??
    (typeof (headers as { get?: (n: string) => unknown }).get === 'function'
      ? (headers as { get: (n: string) => unknown }).get('X-Estate-Id')
      : undefined);
  if (explicitEstate === undefined || explicitEstate === null || explicitEstate === '') {
    const activeEstateId = await SecureStore.getItemAsync(ACTIVE_ESTATE_STORAGE_KEY);
    if (activeEstateId) {
      headers['X-Estate-Id'] = activeEstateId;
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url ?? '');
    const isLoginAttempt =
      (url.includes('/login/admin') || url.includes('/login/')) &&
      error.config?.method?.toLowerCase() === 'post';
    if (status === 401 && !isLoginAttempt) {
      await SecureStore.deleteItemAsync(SECURE_ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(ACTIVE_ESTATE_STORAGE_KEY);
      notifySessionUnauthorized();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
