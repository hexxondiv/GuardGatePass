/**
 * Thin API-aligned types for guard app services (FastAPI / OpenAPI + admin web parity).
 * Prefer extending here when backend adds fields rather than duplicating across screens.
 */

/** `schemas.UserResponse` subset — `GET /users/my_profile`. Use `id` as `guard_id` on verify. */
export type MyProfileResponse = {
  id: number;
  name: string;
  address?: string;
  phone: string;
  email?: string | null;
  status?: string | null;
  access_level_id?: number | null;
  housing_type_id?: number | null;
  housing_type?: unknown;
  role?: { id: number; name: string } | null;
  property_unit?: unknown;
};

export type EstateMember = {
  id: number;
  user_id: number;
  estate_id: number;
  role_id: number;
  is_primary: boolean;
  status: string;
  created_at: string;
  user: MyProfileResponse;
  role?: { id: number; name: string } | null;
};

export type EstateMemberListResponse = {
  items: EstateMember[];
  total: number;
};

/** `schemas.UseGatePass` — `POST /gatepass/verify` and `POST /gatepass/access`. */
export type UseGatePassPayload = {
  access_code?: string | number | null;
  qr_token?: string | null;
  guard_id?: number | null;
  verification_mode?: string | null;
  device_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** `schemas.GatePassVerificationResponse`. */
export type GatePassVerificationResult = {
  message: string;
  valid: boolean;
  gate_pass_id: number;
  status: string;
  remaining_uses: number;
  event_type?: string | null;
  denial_reason?: string | null;
};

/** `schemas.InstantGuestCreate` — `POST /gatepass/instant-guest`. */
export type InstantGuestCreatePayload = {
  host_id: number;
  guest_name?: string | null;
  guest_number?: string | null;
  purpose?: string | null;
  access_type?: string | null;
};

/** `schemas.GuestBookResponse` — response from instant guest create. */
export type GuestBookResponse = {
  id: number;
  estate_id?: number | null;
  host_id: number;
  access_code: string;
  access_type: string;
  created_at: string;
  expiry_at: string;
  max_usage: number;
  total_clocks: number;
  guest_name?: string | null;
  guest_number?: string | null;
  purpose?: string | null;
  gate_pass_id?: number | null;
};

/** `schemas.GuardDeviceRegisterRequest`. */
export type GuardDeviceRegisterRequest = {
  device_id: string;
  device_name?: string | null;
  platform?: string | null;
  app_version?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** `schemas.GuardDeviceDeactivateRequest`. */
export type GuardDeviceDeactivateRequest = {
  device_id: string;
};

/** `schemas.GuardDeviceResponse`. */
export type GuardDeviceResponse = {
  id: number;
  estate_id: number;
  guard_id: number;
  device_id: string;
  device_name?: string | null;
  platform?: string | null;
  app_version?: string | null;
  status: string;
  device_status: string;
  registered_at: string;
  last_seen_at?: string | null;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  last_uploaded_event_at?: string | null;
  metadata_json?: string | null;
};

/** `schemas.GuardSyncPassOut`. */
export type GuardSyncPassOut = {
  gate_pass_id: number;
  estate_id?: number | null;
  access_code: number | string;
  qr_token?: string | null;
  status: string;
  valid_from?: string | null;
  valid_until?: string | null;
  max_usage: number;
  total_clocks: number;
  remaining_uses: number;
  guest_name?: string | null;
  guest_number?: string | null;
  host_id?: number | null;
  near_expiry?: boolean;
  /** Lowercase guest-book `access_type` when present (e.g. `instant`). */
  access_type?: string | null;
  /** False for instant guests until host authorizes exit (`exit_authorized_at`). */
  exit_authorized?: boolean;
};

/** `schemas.GuardSyncBootstrapResponse`. */
export type GuardSyncBootstrapResponse = {
  device: GuardDeviceResponse;
  server_time: string;
  near_expiry_window_minutes: number;
  pass_count: number;
  passes: GuardSyncPassOut[];
};

/** `schemas.GuardSyncEventIn`. */
export type GuardSyncEventIn = {
  idempotency_key: string;
  source_event_id?: string | null;
  access_code?: number | string | null;
  qr_token?: string | null;
  event_type: string;
  event_time: string;
  verification_mode?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** `schemas.GuardSyncEventUploadRequest`. */
export type GuardSyncEventUploadRequest = {
  device_id: string;
  events: GuardSyncEventIn[];
};

/** `schemas.GuardSyncEventResult`. */
export type GuardSyncEventResult = {
  idempotency_key: string;
  source_event_id?: string | null;
  gate_pass_id?: number | null;
  log_id?: number | null;
  effective_status: string;
  event_type: string;
  conflict_code?: string | null;
  detail: string;
};

/** `schemas.GuardSyncEventUploadResponse`. */
export type GuardSyncEventUploadResponse = {
  device: GuardDeviceResponse;
  accepted_count: number;
  duplicate_count: number;
  conflict_count: number;
  results: GuardSyncEventResult[];
};
