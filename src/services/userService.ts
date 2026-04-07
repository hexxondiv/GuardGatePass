import { API_ENDPOINTS } from '../config/app_constants';
import type { MyProfileResponse } from '../types/gateApi';
import apiClient from '../utils/apiClient';

/**
 * Current user profile — `GET /users/my_profile`.
 * After login, `id` is the canonical user id for `guard_id` on `POST /gatepass/verify` payloads.
 */
export async function getMyProfile(): Promise<MyProfileResponse> {
  const res = await apiClient.get<MyProfileResponse>(API_ENDPOINTS.MY_PROFILE);
  return res.data;
}
