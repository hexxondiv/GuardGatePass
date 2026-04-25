import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../config/app_constants';

export interface AdminLoginResponse {
  access_token: string;
  token_type: string;
  barrier_webhook_url?: string | null;
}

/**
 * Staff login — `POST /login/admin` with account access code (not a gate pass code).
 */
export async function loginStaff(phone: string, accessCode: string): Promise<AdminLoginResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_BASE_URL.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  const response = await axios.post<AdminLoginResponse>(
    `${API_BASE_URL}${API_ENDPOINTS.LOGIN_ADMIN}`,
    { phone, access_code: accessCode },
    { headers },
  );

  const token = response.data?.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('Login response missing access_token');
  }

  return response.data;
}
