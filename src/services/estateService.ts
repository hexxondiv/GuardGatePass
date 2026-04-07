import { API_ENDPOINTS } from '../config/app_constants';
import type { EstateMemberListResponse } from '../types/gateApi';
import type { EstateSummary } from '../utils/accessControl';
import apiClient from '../utils/apiClient';

type EstateListItem = { id: number | string; name?: string | null };

type EstateListResponse = {
  items: EstateListItem[];
  total: number;
};

const PAGE_SIZE = 100;

/**
 * Estate members search — same contract as `gatepass-frontend` `getEstateMembers`
 * (`GET /estates/{estateId}/members` with optional filters).
 */
export async function getEstateMembers(
  estateId: number | string,
  filters: {
    skip?: number;
    limit?: number;
    user_id?: number | string;
    q?: string;
    name?: string;
    phone?: string;
    email?: string;
    status?: string;
    address?: string;
    role_id?: number | string;
    exclude_role_id?: number | string;
    housing_type_id?: number | string;
    property_id?: number | string;
    property_unit_id?: number | string;
  } = {},
): Promise<EstateMemberListResponse> {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  );

  const res = await apiClient.get<EstateMemberListResponse>(API_ENDPOINTS.ESTATE_MEMBERS(estateId), {
    params,
  });
  return res.data;
}

/**
 * Paginates `GET /estates/` — canonical list for `super_admin` (same as `gatepass-frontend` `fetchAllEstatesSummaries`).
 */
export async function fetchAllEstatesSummaries(): Promise<EstateSummary[]> {
  const byId = new Map<string, EstateSummary>();
  let skip = 0;
  let total = Number.POSITIVE_INFINITY;

  while (skip < total) {
    const res = await apiClient.get<EstateListResponse>(API_ENDPOINTS.ESTATES, {
      params: { skip, limit: PAGE_SIZE },
    });
    const data = res.data;
    for (const e of data.items) {
      const id = String(e.id);
      const name = (e.name ?? '').trim() || `Estate ${e.id}`;
      byId.set(id, { id, name });
    }
    total = data.total;
    skip += data.items.length;
    if (data.items.length === 0) {
      break;
    }
  }

  return Array.from(byId.values());
}
