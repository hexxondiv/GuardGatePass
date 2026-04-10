import type { GuardSyncPassOut } from '../types/gateApi';

export type OfflinePassEvaluation =
  | { ok: true; pass: GuardSyncPassOut }
  | { ok: false; reason: string; requiresOnline?: boolean };

function normalizeCode(v: number | string): string {
  return String(v).trim();
}

function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Read-only checks aligned with bootstrap snapshot + server gate rules (see `gatepass-api`
 * `_apply_offline_sync_event` / `_build_guard_sync_pass`). When local data is insufficient,
 * prefer requiring online verification.
 */
export function evaluateOfflinePass(
  pass: GuardSyncPassOut,
  now: Date = new Date(),
): OfflinePassEvaluation {
  const status = (pass.status || '').trim().toLowerCase();
  if (status !== 'pending') {
    return {
      ok: false,
      reason: 'This pass is not active for offline verification. Online verification required.',
      requiresOnline: true,
    };
  }

  // Mirror `gatepass-api` `_apply_offline_sync_event`: exhaustion only when `max_usage` is truthy
  // (`if gate_pass.max_usage and total_clocks >= max_usage`). `max_usage === 0` means no cap;
  // bootstrap still sends `remaining_uses: 0` from `_remaining_uses` in that case.
  const hasUsageCap = pass.max_usage > 0;
  if (hasUsageCap && pass.remaining_uses <= 0) {
    return { ok: false, reason: 'No remaining uses for this pass.' };
  }

  const from = parseIso(pass.valid_from ?? null);
  const until = parseIso(pass.valid_until ?? null);
  if (from && now < from) {
    return { ok: false, reason: 'Pass is not valid yet.' };
  }
  if (until && now > until) {
    return { ok: false, reason: 'Pass has expired.' };
  }

  return { ok: true, pass };
}

export function findPassByAccessCode(
  passes: GuardSyncPassOut[],
  accessCode: string,
): GuardSyncPassOut | null {
  const want = normalizeCode(accessCode);
  for (const p of passes) {
    if (normalizeCode(p.access_code) === want) {
      return p;
    }
  }
  return null;
}
