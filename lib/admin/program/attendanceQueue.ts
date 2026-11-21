/**
 * The offline attendance queue (V4 Stage E; privacy rule = hardening item B,
 * #588, and audit finding 8).
 *
 * What it may hold: PENDING MARKS ONLY, each exactly
 *   { sessionId, participantId, status, at }
 * No names, no roster, no page, no cohort. toPendingMark() strips anything
 * else a caller passes, so a roster entry can never be written by accident.
 *
 * Rules:
 *  - enqueue replaces any pending mark for the same session + participant
 *    (dedupe; the newest tap is the one that syncs);
 *  - flush sends one batch per session; a mark leaves the queue only when the
 *    server accepted it AND it was not re-tapped while the request was out;
 *  - a refusal that can never succeed (400, 403, 404: wrong org, no
 *    permission, session gone) drops those marks and reports them; a network
 *    error or 5xx keeps them for the next try; 401 keeps them (sign in again);
 *  - logout and org switch clear the whole queue (clearAttendanceQueue, called
 *    from clearAdminCaches in lib/admin/swCache.ts).
 *
 * Storage is IndexedDB in the browser (idbStore) and an in-memory store for
 * tests (memoryStore); the logic only sees the QueueStore interface.
 */

import { isMarkStatus, type MarkStatus } from "./attendance";

export type PendingMark = {
  sessionId: string;
  participantId: string;
  status: MarkStatus;
  /** ISO time of the tap. Last write wins on the server by this time. */
  at: string;
};

export interface QueueStore {
  all(): Promise<PendingMark[]>;
  put(mark: PendingMark): Promise<void>;
  /** Remove the mark for this key, only if it still carries this tap time. */
  removeIfUnchanged(mark: PendingMark): Promise<void>;
  clear(): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const markKey = (m: Pick<PendingMark, "sessionId" | "participantId">) => `${m.sessionId}:${m.participantId}`;

/** Exactly the four allowed fields, validated. Anything else is dropped. */
export function toPendingMark(input: unknown): PendingMark | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (typeof r.sessionId !== "string" || !UUID.test(r.sessionId)) return null;
  if (typeof r.participantId !== "string" || !UUID.test(r.participantId)) return null;
  if (!isMarkStatus(r.status)) return null;
  const t = typeof r.at === "string" ? Date.parse(r.at) : NaN;
  const at = Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
  return { sessionId: r.sessionId.toLowerCase(), participantId: r.participantId.toLowerCase(), status: r.status, at };
}

export async function enqueue(store: QueueStore, input: unknown): Promise<PendingMark | null> {
  const mark = toPendingMark(input);
  if (!mark) return null;
  await store.put(mark);
  return mark;
}

export async function pendingMarks(store: QueueStore, sessionId?: string): Promise<PendingMark[]> {
  const all = await store.all();
  return sessionId ? all.filter((m) => m.sessionId === sessionId.toLowerCase()) : all;
}

export type SendResult = { ok: true } | { ok: false; status: number | null };
export type Sender = (sessionId: string, marks: PendingMark[]) => Promise<SendResult>;

export type FlushResult = {
  sent: number;
  /** Kept for the next try (offline, server error, signed out). */
  kept: number;
  /** Dropped because the server refused them for good. */
  rejected: number;
};

const FINAL_REFUSAL = new Set([400, 403, 404, 409, 422]);

/** Send every pending mark, one request per session. Never throws. */
export async function flush(store: QueueStore, send: Sender): Promise<FlushResult> {
  const all = await store.all();
  const bySession = new Map<string, PendingMark[]>();
  for (const m of all) {
    const list = bySession.get(m.sessionId) ?? [];
    list.push(m);
    bySession.set(m.sessionId, list);
  }
  const result: FlushResult = { sent: 0, kept: 0, rejected: 0 };
  for (const [sessionId, marks] of Array.from(bySession.entries())) {
    let r: SendResult;
    try {
      r = await send(sessionId, marks);
    } catch {
      r = { ok: false, status: null };
    }
    if (r.ok || (r.status !== null && FINAL_REFUSAL.has(r.status))) {
      for (const m of marks) await store.removeIfUnchanged(m);
      if (r.ok) result.sent += marks.length;
      else result.rejected += marks.length;
    } else {
      result.kept += marks.length;
    }
  }
  return result;
}

// ── Stores ─────────────────────────────────────────────────────────────────

/** In-memory store (tests, and a fallback when IndexedDB is unavailable). */
export function memoryStore(): QueueStore & { raw: Map<string, PendingMark> } {
  const raw = new Map<string, PendingMark>();
  return {
    raw,
    async all() {
      return Array.from(raw.values()).map((m) => ({ ...m }));
    },
    async put(m) {
      const clean = toPendingMark(m);
      if (clean) raw.set(markKey(clean), clean);
    },
    async removeIfUnchanged(m) {
      const have = raw.get(markKey(m));
      if (have && have.at === m.at && have.status === m.status) raw.delete(markKey(m));
    },
    async clear() {
      raw.clear();
    },
  };
}

export const QUEUE_DB = "bloomos-attendance-queue";
const STORE = "marks";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req ? (req.result as T) : undefined);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

/** The browser store. Each record is the pending mark plus its key; nothing else. */
export function idbStore(): QueueStore {
  return {
    async all() {
      const rows = ((await tx<unknown[]>("readonly", (s) => s.getAll())) ?? []) as unknown[];
      return rows.map(toPendingMark).filter((m): m is PendingMark => m !== null);
    },
    async put(m) {
      const clean = toPendingMark(m);
      if (!clean) return;
      await tx("readwrite", (s) => s.put({ key: markKey(clean), ...clean }));
    },
    async removeIfUnchanged(m) {
      const key = markKey(m);
      const have = toPendingMark(await tx<unknown>("readonly", (s) => s.get(key)));
      if (have && have.at === m.at && have.status === m.status) await tx("readwrite", (s) => s.delete(key));
    },
    async clear() {
      await tx("readwrite", (s) => s.clear());
    },
  };
}

/** The store the app uses: IndexedDB when the browser has it, memory otherwise. */
let shared: QueueStore | null = null;
export function browserQueue(): QueueStore {
  if (!shared) shared = typeof indexedDB !== "undefined" ? idbStore() : memoryStore();
  return shared;
}

/**
 * Logout / org switch: delete the queue database outright. Best effort and
 * never throws, so a logout never stalls on it.
 */
export async function clearAttendanceQueue(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(QUEUE_DB);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
  shared = null;
}

/** The sender the app uses: one POST per session to the batch route. */
export const httpSender: Sender = async (sessionId, marks) => {
  try {
    const res = await fetch(`/api/admin/sessions/${sessionId}/attendance/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marks: marks.map((m) => ({ student_id: m.participantId, status: m.status, at: m.at })),
      }),
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
};
