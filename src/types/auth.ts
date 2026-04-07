/**
 * JWT payload fields for staff sessions (see gatepass-api `admin_login` / admin web decode).
 * Client-side only — server validates every request.
 */
export interface StaffJwtPayload extends Record<string, unknown> {
  user_id?: number;
  access_level_id?: number;
  role_name?: string;
  estate_id?: number | string;
  estate_name?: string;
  exp?: number;
  estates?: unknown[];
}
