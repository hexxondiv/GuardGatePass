import { API_ENDPOINTS } from '../config/app_constants';
import type { EstateSummary } from '../utils/accessControl';
import apiClient from '../utils/apiClient';

type EstateListItem = { id: number | string; name?: string | null };

type EstateListResponse = {
  items: EstateListItem[];
  total: number;
};

const PAGE_SIZE = 100;

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
