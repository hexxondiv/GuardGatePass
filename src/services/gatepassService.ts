import { API_ENDPOINTS } from '../config/app_constants';
import type {
  GatePassVerificationResult,
  GuestBookResponse,
  InstantGuestCreatePayload,
  UseGatePassPayload,
} from '../types/gateApi';
import apiClient from '../utils/apiClient';

/** `POST /gatepass/verify` — validation / verification outcome. */
export async function verifyGatePass(
  payload: UseGatePassPayload,
): Promise<GatePassVerificationResult> {
  const res = await apiClient.post<GatePassVerificationResult>(API_ENDPOINTS.GATEPASS_VERIFY, payload);
  return res.data;
}

/** `POST /gatepass/access` — record gate use (same payload shape as verify). */
export async function recordGatePassAccess(
  payload: UseGatePassPayload,
): Promise<GatePassVerificationResult> {
  const res = await apiClient.post<GatePassVerificationResult>(API_ENDPOINTS.GATEPASS_ACCESS, payload);
  return res.data;
}

/** `POST /gatepass/instant-guest` — walk-in instant guest (same payload as admin web). */
export async function adminCreateInstantGuest(
  payload: InstantGuestCreatePayload,
): Promise<GuestBookResponse> {
  const res = await apiClient.post<GuestBookResponse>(API_ENDPOINTS.GATEPASS_INSTANT_GUEST, payload);
  return res.data;
}
