import Constants from 'expo-constants';
import { Platform } from 'react-native';
import axios from 'axios';
import {
  countPendingEvents,
  deletePendingByIdempotencyKeys,
  enqueuePendingEvent,
  getKv,
  getOfflineExpectCheckOut,
  listPendingEvents,
  loadPassesForEstate,
  patchPendingEventSourceId,
  replacePassesForEstate,
  setKv,
  setOfflineExpectCheckOut,
  upsertPassSnapshot,
} from '../storage/guardSyncLocalDb';
import type { GuardSyncEventIn, GuardSyncPassOut } from '../types/gateApi';
import { guardSyncResultUserMessage } from '../utils/guardSyncConflictMessage';
import { notifyGuardSyncQueueChanged } from '../utils/guardSyncQueueNotifier';
import { evaluateOfflinePass, findPassByAccessCode } from '../utils/offlinePassVerify';
import { getOrCreateDeviceId } from '../utils/deviceId';
import { bootstrapGuardSync, registerGuardDevice, uploadGuardSyncEvents } from './guardSyncService';

const K_LAST_SYNC_ISO = 'guard_sync_last_sync_iso';
const K_LAST_SYNC_ESTATE = 'guard_sync_last_sync_estate_id';
const K_LAST_PASS_COUNT = 'guard_sync_last_pass_count';

export type GuardSyncBootstrapOutcome =
  | { ok: true; passCount: number; serverTime: string }
  | { ok: false; message: string; code?: 'device_locked' };

type GuardSyncErrorDetails = { message: string; code?: 'device_locked' };

function describeGuardSyncError(error: unknown): GuardSyncErrorDetails {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
    const detailText = typeof detail === 'string' ? detail : '';
    if (status === 423 || status === 403) {
      const lowered = detailText.toLowerCase();
      if (lowered.includes('device') && (lowered.includes('locked') || lowered.includes('deactivated'))) {
        return {
          code: 'device_locked',
          message: detailText || 'This device is locked by admin.',
        };
      }
    }
    return { message: error.message };
  }
  const msg =
    error && typeof error === 'object' && 'message' in error
      ? String((error as Error).message)
      : String(error);
  return { message: msg };
}

function buildRegisterPayload(deviceId: string) {
  return {
    device_id: deviceId,
    device_name: Constants.deviceName ?? undefined,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? undefined,
    metadata: {
      expo_sdk: Constants.expoConfig?.sdkVersion,
    },
  };
}

/**
 * Register handset + refresh bootstrap cache for the current estate (caller must have JWT + X-Estate-Id).
 */
export async function runGuardSyncBootstrap(estateId: string): Promise<GuardSyncBootstrapOutcome> {
  const deviceId = await getOrCreateDeviceId();
  if (!deviceId) {
    return { ok: false, message: 'Could not read device id from secure storage.' };
  }

  try {
    await registerGuardDevice(buildRegisterPayload(deviceId));
  } catch (e: unknown) {
    const out = describeGuardSyncError(e);
    return {
      ok: false,
      code: out.code,
      message: `Device registration failed: ${out.message}`,
    };
  }

  try {
    const data = await bootstrapGuardSync(deviceId);
    await replacePassesForEstate(estateId, data.passes);
    const syncIso =
      typeof data.server_time === 'string' ? data.server_time : new Date().toISOString();
    await setKv(K_LAST_SYNC_ISO, syncIso);
    await setKv(K_LAST_SYNC_ESTATE, estateId);
    await setKv(K_LAST_PASS_COUNT, String(data.pass_count));
    return { ok: true, passCount: data.pass_count, serverTime: data.server_time };
  } catch (e: unknown) {
    const out = describeGuardSyncError(e);
    return {
      ok: false,
      code: out.code,
      message: `Bootstrap failed: ${out.message}`,
    };
  }
}

export async function readLastGuardSyncMeta(): Promise<{
  lastSyncIso: string | null;
  lastSyncEstateId: string | null;
  passCount: number | null;
}> {
  const lastSyncIso = await getKv(K_LAST_SYNC_ISO);
  const lastSyncEstateId = await getKv(K_LAST_SYNC_ESTATE);
  const pc = await getKv(K_LAST_PASS_COUNT);
  return {
    lastSyncIso,
    lastSyncEstateId,
    passCount: pc != null ? Number(pc) : null,
  };
}

function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type OfflineVerifyQueueOutcome =
  | {
      ok: true;
      queued: true;
      message: string;
      eventType: 'check_in' | 'check_out';
      gatePassId: number;
      guestName?: string | null;
      remainingUsesAfterOptimistic: number;
      maxUsage: number;
    }
  | { ok: false; message: string; requiresOnline?: boolean };

/**
 * Queue a single offline verify event (toggle: check_in vs check_out) using local session hints.
 */
export async function queueOfflineVerifyForAccessCode(
  estateId: string,
  accessCode: string,
): Promise<OfflineVerifyQueueOutcome> {
  const passes = await loadPassesForEstate(estateId);
  const raw = findPassByAccessCode(passes, accessCode);
  if (!raw) {
    return {
      ok: false,
      message: 'Pass not found in offline cache. Connect and sync, or use online verification.',
      requiresOnline: true,
    };
  }

  const ev = evaluateOfflinePass(raw);
  if (!ev.ok) {
    return { ok: false, message: ev.reason, requiresOnline: ev.requiresOnline };
  }

  const expectCheckOut = await getOfflineExpectCheckOut(estateId, raw.gate_pass_id);
  const eventType: 'check_in' | 'check_out' = expectCheckOut ? 'check_out' : 'check_in';

  const isInstant = (raw.access_type ?? '').trim().toLowerCase() === 'instant';
  if (
    eventType === 'check_out' &&
    isInstant &&
    raw.exit_authorized !== true
  ) {
    return {
      ok: false,
      message:
        'This instant guest cannot check out offline until the host authorizes exit. Go online to verify or sync after approval.',
      requiresOnline: true,
    };
  }

  const idempotencyKey = newIdempotencyKey();
  const eventTime = new Date().toISOString();
  const event: GuardSyncEventIn = {
    idempotency_key: idempotencyKey,
    access_code: /^\d+$/.test(accessCode) ? Number(accessCode) : accessCode,
    event_type: eventType,
    event_time: eventTime,
    verification_mode: 'access_code',
    metadata: { offline_client: true },
  };

  const localId = await enqueuePendingEvent(event);
  await patchPendingEventSourceId(idempotencyKey, String(localId));

  await setOfflineExpectCheckOut(estateId, raw.gate_pass_id, eventType === 'check_in');

  const hasUsageCap = raw.max_usage > 0;
  const nextPass: GuardSyncPassOut = {
    ...raw,
    total_clocks: raw.total_clocks + 1,
    remaining_uses: hasUsageCap ? Math.max(0, raw.remaining_uses - 1) : raw.remaining_uses,
  };
  await upsertPassSnapshot(estateId, nextPass);
  notifyGuardSyncQueueChanged();

  const label = eventType === 'check_in' ? 'Check-in' : 'Check-out';
  return {
    ok: true,
    queued: true,
    message: `${label} recorded offline — will sync when you are back online.`,
    eventType,
    gatePassId: raw.gate_pass_id,
    guestName: raw.guest_name,
    remainingUsesAfterOptimistic: nextPass.remaining_uses,
    maxUsage: raw.max_usage,
  };
}

/** After successful online `POST /gatepass/verify`, align local toggle with authoritative `event_type`. */
export async function alignOfflineToggleFromOnlineVerify(
  estateId: string,
  gatePassId: number,
  eventType: string | null | undefined,
): Promise<void> {
  const t = (eventType || '').trim().toLowerCase();
  if (t === 'check_in') {
    await setOfflineExpectCheckOut(estateId, gatePassId, true);
  } else if (t === 'check_out') {
    await setOfflineExpectCheckOut(estateId, gatePassId, false);
  }
}

const BATCH = 40;

export type FlushGuardSyncQueueOutcome = {
  uploaded: number;
  conflicts: string[];
  duplicates: number;
  accepted: number;
};

/**
 * Upload pending offline events. Removes rows whose idempotency keys return a terminal server result.
 */
export async function flushGuardSyncEventQueue(estateId: string): Promise<FlushGuardSyncQueueOutcome> {
  try {
    const deviceId = await getOrCreateDeviceId();
    if (!deviceId) {
      return { uploaded: 0, conflicts: ['Missing device id'], duplicates: 0, accepted: 0 };
    }

    const pending = await listPendingEvents();
    if (pending.length === 0) {
      return { uploaded: 0, conflicts: [], duplicates: 0, accepted: 0 };
    }

    const conflicts: string[] = [];
    let accepted = 0;
    let duplicates = 0;
    let anyBatchOk = false;

    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH);
      let res: Awaited<ReturnType<typeof uploadGuardSyncEvents>>;
      try {
        res = await uploadGuardSyncEvents({ device_id: deviceId, events: chunk });
      } catch {
        throw new Error('Upload interrupted — remaining events kept for retry.');
      }
      anyBatchOk = true;
      const keysThisBatch = res.results.map((r) => r.idempotency_key);
      for (const r of res.results) {
        const st = r.effective_status;
        if (st === 'accepted') {
          accepted += 1;
        } else if (st === 'duplicate_accepted' || st === 'duplicate_conflict') {
          duplicates += 1;
        } else if (st === 'conflict') {
          conflicts.push(guardSyncResultUserMessage(r));
        }
      }
      await deletePendingByIdempotencyKeys(keysThisBatch);
    }

    if (anyBatchOk) {
      try {
        await runGuardSyncBootstrap(estateId);
      } catch {
        /* bootstrap refresh is best-effort after upload */
      }
    }

    return {
      uploaded: pending.length,
      conflicts,
      duplicates,
      accepted,
    };
  } finally {
    notifyGuardSyncQueueChanged();
  }
}

export { countPendingEvents };
