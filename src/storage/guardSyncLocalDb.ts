import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { GuardSyncEventIn, GuardSyncPassOut } from '../types/gateApi';

const DB_NAME = 'guard_sync_local.db';

let dbPromise: Promise<SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS kv (
          k TEXT PRIMARY KEY NOT NULL,
          v TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS passes (
          gate_pass_id INTEGER NOT NULL,
          estate_id TEXT NOT NULL,
          json TEXT NOT NULL,
          PRIMARY KEY (gate_pass_id, estate_id)
        );
        CREATE TABLE IF NOT EXISTS pending_sync_events (
          local_id INTEGER PRIMARY KEY AUTOINCREMENT,
          idempotency_key TEXT NOT NULL UNIQUE,
          json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS offline_toggle (
          gate_pass_id INTEGER NOT NULL,
          estate_id TEXT NOT NULL,
          expect_check_out INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (gate_pass_id, estate_id)
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function setKv(k: string, v: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [k, v]);
}

export async function getKv(k: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', [k]);
  return row?.v ?? null;
}

/** Replace cached passes for the active estate (bootstrap snapshot). */
export async function replacePassesForEstate(estateId: string, passes: GuardSyncPassOut[]): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM passes WHERE estate_id = ?', [estateId]);
    for (const p of passes) {
      await txn.runAsync('INSERT INTO passes (gate_pass_id, estate_id, json) VALUES (?, ?, ?)', [
        p.gate_pass_id,
        estateId,
        JSON.stringify(p),
      ]);
    }
  });
}

export async function loadPassesForEstate(estateId: string): Promise<GuardSyncPassOut[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(
    'SELECT json FROM passes WHERE estate_id = ? ORDER BY gate_pass_id ASC',
    [estateId],
  );
  return rows.map((r) => JSON.parse(r.json) as GuardSyncPassOut);
}

export async function upsertPassSnapshot(estateId: string, pass: GuardSyncPassOut): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO passes (gate_pass_id, estate_id, json) VALUES (?, ?, ?)', [
    pass.gate_pass_id,
    estateId,
    JSON.stringify(pass),
  ]);
}

export async function enqueuePendingEvent(event: GuardSyncEventIn): Promise<number> {
  const db = await getDb();
  const createdAt = new Date().toISOString();
  const res = await db.runAsync(
    'INSERT INTO pending_sync_events (idempotency_key, json, created_at) VALUES (?, ?, ?)',
    [event.idempotency_key, JSON.stringify(event), createdAt],
  );
  return Number(res.lastInsertRowId);
}

export async function patchPendingEventSourceId(idempotencyKey: string, sourceEventId: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>(
    'SELECT json FROM pending_sync_events WHERE idempotency_key = ?',
    [idempotencyKey],
  );
  if (!row) return;
  const ev = JSON.parse(row.json) as GuardSyncEventIn;
  ev.source_event_id = sourceEventId;
  await db.runAsync('UPDATE pending_sync_events SET json = ? WHERE idempotency_key = ?', [
    JSON.stringify(ev),
    idempotencyKey,
  ]);
}

export async function listPendingEvents(): Promise<GuardSyncEventIn[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(
    'SELECT json FROM pending_sync_events ORDER BY local_id ASC',
  );
  return rows.map((r) => JSON.parse(r.json) as GuardSyncEventIn);
}

export async function deletePendingByIdempotencyKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const k of keys) {
      await txn.runAsync('DELETE FROM pending_sync_events WHERE idempotency_key = ?', [k]);
    }
  });
}

export async function countPendingEvents(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM pending_sync_events');
  return row?.c ?? 0;
}

export async function getOfflineExpectCheckOut(
  estateId: string,
  gatePassId: number,
): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ expect_check_out: number }>(
    'SELECT expect_check_out FROM offline_toggle WHERE estate_id = ? AND gate_pass_id = ?',
    [estateId, gatePassId],
  );
  return (row?.expect_check_out ?? 0) === 1;
}

export async function setOfflineExpectCheckOut(
  estateId: string,
  gatePassId: number,
  expectCheckOut: boolean,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO offline_toggle (gate_pass_id, estate_id, expect_check_out)
     VALUES (?, ?, ?)`,
    [gatePassId, estateId, expectCheckOut ? 1 : 0],
  );
}

/** Clear local check-in/out expectation when estate changes or user signs out. */
export async function clearOfflineTogglesForEstate(estateId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM offline_toggle WHERE estate_id = ?', [estateId]);
}

export async function clearAllGuardSyncLocalData(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM passes;
    DELETE FROM pending_sync_events;
    DELETE FROM offline_toggle;
    DELETE FROM kv;
  `);
}
