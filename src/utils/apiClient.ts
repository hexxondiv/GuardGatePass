import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config/app_constants';

/** Placeholder — interceptors and headers finalized in Workstream 3. */
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
  const token = await SecureStore.getItemAsync('userToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
