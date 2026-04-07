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
