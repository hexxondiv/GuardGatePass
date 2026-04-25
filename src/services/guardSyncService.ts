import { API_ENDPOINTS } from '../config/app_constants';
import type {
  GuardDeviceDeactivateRequest,
  GuardDeviceRegisterRequest,
  GuardDeviceResponse,
  GuardSyncBootstrapResponse,
  GuardSyncEventUploadRequest,
  GuardSyncEventUploadResponse,
} from '../types/gateApi';
import apiClient from '../utils/apiClient';

/** `POST /guard-devices/register` — register or refresh this handset for the current guard estate. */
export async function registerGuardDevice(
  payload: GuardDeviceRegisterRequest,
): Promise<GuardDeviceResponse> {
  const res = await apiClient.post<GuardDeviceResponse>(API_ENDPOINTS.GUARD_DEVICES_REGISTER, payload);
  return res.data;
}

/** `POST /guard-devices/deactivate` — mark this handset inactive for current guard estate. */
export async function deactivateGuardDevice(
  payload: GuardDeviceDeactivateRequest,
): Promise<GuardDeviceResponse> {
  const res = await apiClient.post<GuardDeviceResponse>(API_ENDPOINTS.GUARD_DEVICES_DEACTIVATE, payload);
  return res.data;
}

/**
 * `GET /guard-sync/bootstrap` — active passes cache for offline verification.
 * Query params match backend: `device_id`, `near_expiry_window_minutes` (default 360 on server).
 */
export async function bootstrapGuardSync(
  deviceId: string,
  nearExpiryWindowMinutes = 360,
): Promise<GuardSyncBootstrapResponse> {
  const res = await apiClient.get<GuardSyncBootstrapResponse>(API_ENDPOINTS.GUARD_SYNC_BOOTSTRAP, {
    params: {
      device_id: deviceId,
      near_expiry_window_minutes: nearExpiryWindowMinutes,
    },
  });
  return res.data;
}

/** `POST /guard-sync/events` — upload offline verify/check-in events (idempotent per `idempotency_key`). */
export async function uploadGuardSyncEvents(
  payload: GuardSyncEventUploadRequest,
): Promise<GuardSyncEventUploadResponse> {
  const res = await apiClient.post<GuardSyncEventUploadResponse>(
    API_ENDPOINTS.GUARD_SYNC_EVENTS,
    payload,
  );
  return res.data;
}
