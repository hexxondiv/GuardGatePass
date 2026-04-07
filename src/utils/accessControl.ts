/**
 * Role and estate helpers aligned with `gatepass-frontend` `accessControl.ts`
 * (JWT claims shape, estate extraction).
 */

export type AppRole = 'super_admin' | 'estate_admin' | 'resident' | 'guard' | 'unknown';

export interface EstateSummary {
  id: string;
  name: string;
}

const ROLE_ALIASES: Record<string, AppRole> = {
  super_admin: 'super_admin',
  superadmin: 'super_admin',
  platform_admin: 'super_admin',
  estate_admin: 'estate_admin',
  admin: 'estate_admin',
  estate_manager: 'estate_admin',
  manager: 'estate_admin',
  resident: 'resident',
  user: 'resident',
  tenant: 'resident',
  guard: 'guard',
  security: 'guard',
};

const ACCESS_LEVEL_ROLE_MAP: Record<number, AppRole> = {
  1: 'super_admin',
  2: 'estate_admin',
  3: 'resident',
  4: 'guard',
};

const STAFF_APP_ROLES: AppRole[] = ['guard', 'estate_admin', 'super_admin'];

const normalizeRole = (value: unknown): AppRole | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ROLE_ALIASES[normalized] || null;
};

const uniqueRoles = (roles: AppRole[]) => Array.from(new Set(roles.filter(Boolean)));

const coerceEstate = (estate: unknown): EstateSummary | null => {
  if (estate === null || estate === undefined) {
    return null;
  }

  if (typeof estate === 'string' || typeof estate === 'number') {
    const id = String(estate);
    return { id, name: `Estate ${id}` };
  }

  if (typeof estate === 'object') {
    const record = estate as Record<string, unknown>;
    const rawId = record.id ?? record.estate_id ?? record.value;
    if (rawId === undefined || rawId === null) {
      return null;
    }

    const id = String(rawId);
    const rawName = record.name ?? record.estate_name ?? record.label;
    return {
      id,
      name: typeof rawName === 'string' && rawName.trim() ? rawName : `Estate ${id}`,
    };
  }

  return null;
};

export const extractRolesFromClaims = (claims: Record<string, unknown> | null | undefined): AppRole[] => {
  if (!claims) {
    return ['unknown'];
  }

  const roleCandidates: unknown[] = [
    claims.role,
    claims.role_name,
    claims.access_level,
    claims.user_role,
    ...(Array.isArray(claims.roles) ? claims.roles : []),
    ...(Array.isArray(claims.role_names) ? claims.role_names : []),
  ];

  const normalizedRoles = roleCandidates
    .map(normalizeRole)
    .filter((role): role is AppRole => Boolean(role));

  const accessLevelId =
    typeof claims.access_level_id === 'number'
      ? claims.access_level_id
      : typeof claims.access_level_id === 'string'
        ? Number(claims.access_level_id)
        : null;

  if (accessLevelId && ACCESS_LEVEL_ROLE_MAP[accessLevelId]) {
    normalizedRoles.push(ACCESS_LEVEL_ROLE_MAP[accessLevelId]);
  }

  const unique = uniqueRoles(normalizedRoles);
  return unique.length ? unique : ['unknown'];
};

export const extractEstatesFromClaims = (claims: Record<string, unknown> | null | undefined): EstateSummary[] => {
  if (!claims) {
    return [];
  }

  const estates: EstateSummary[] = [];
  const directEstate = coerceEstate({
    id: claims.estate_id,
    name: claims.estate_name,
  });

  if (directEstate) {
    estates.push(directEstate);
  }

  if (Array.isArray(claims.estates)) {
    claims.estates
      .map(coerceEstate)
      .filter((estate): estate is EstateSummary => Boolean(estate))
      .forEach((estate) => estates.push(estate));
  }

  return estates.filter(
    (estate, index, list) => list.findIndex((item) => item.id === estate.id) === index,
  );
};

export function isStaffAppRole(roles: AppRole[]): boolean {
  return roles.some((r) => STAFF_APP_ROLES.includes(r));
}
