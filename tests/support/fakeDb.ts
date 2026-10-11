/**
 * A small in-memory stand-in for the Supabase session client, for the Capture
 * C3 tests (confirm / undo / edit / appliers). It runs the PostgREST builder
 * chain the capture code uses against plain arrays, so a test can assert the
 * resulting rows rather than a scripted call sequence.
 *
 * Supported: from().select(cols, { count, head }) / insert / update / delete,
 * filters eq (including `col->>key`), neq, in, is, contains, lt, lte, gt, gte,
 * or("a.is.null,a.lt.X"), order, limit, then single / maybeSingle / await;
 * rpc(name, args) via a stub. Each statement runs atomically (no await inside),
 * so two concurrent conditional updates race exactly like two Postgres
 * statements would: one sees the row, the other doesn't.
 *
 * "RLS" is simulated with per-table predicates: `visible` hides rows from
 * reads/updates/deletes, `denyInsert` raises 42501 on insert. Unique keys
 * raise 23505.
 */

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Err = { code: string; message: string };
type Result = { data: unknown; error: Err | null; count?: number | null };

export type FakeDbOptions = {
  /** Unique keys per table, each a list of columns. */
  unique?: Record<string, string[][]>;
  /** Tables whose inserts fail with an RLS denial. */
  denyInsert?: Set<string>;
  /** Tables whose deletes silently match nothing (RLS USING false). */
  denyDelete?: Set<string>;
  /** Row visibility per table (RLS USING). Rows failing it are invisible. */
  visible?: Record<string, (row: Row) => boolean>;
  /** Tables that get a fresh updated_at on every update (set_updated_at triggers). */
  touchUpdatedAt?: Set<string>;
  rpc?: (name: string, args: Record<string, unknown>) => Result | Promise<Result>;
  now?: () => Date;
};

export type FakeDb = {
  tables: Record<string, Row[]>;
  client: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  inserts: { table: string; row: Row }[];
  deletes: { table: string; row: Row }[];
  opts: FakeDbOptions;
};

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function getPath(row: Row, col: string): unknown {
  const m = col.match(/^([a-z_]+)->>?([a-z_]+)$/);
  if (m) {
    const obj = row[m[1]] as Row | null | undefined;
    const v = obj ? obj[m[2]] : null;
    return col.includes("->>") && v !== null && v !== undefined ? String(v) : v ?? null;
  }
  return row[col] ?? null;
}

const cmp = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

type Filter = (row: Row) => boolean;

function parseOr(expr: string): Filter {
  const parts = expr.split(",").map((p) => {
    const [col, op, ...rest] = p.split(".");
    const val = rest.join(".");
    return (row: Row) => {
      const v = getPath(row, col);
      switch (op) {
        case "is":
          return val === "null" ? v === null : String(v) === val;
        case "eq":
          return String(v) === val;
        case "lt":
          return v !== null && cmp(v, val) < 0;
        case "lte":
          return v !== null && cmp(v, val) <= 0;
        case "gt":
          return v !== null && cmp(v, val) > 0;
        case "gte":
          return v !== null && cmp(v, val) >= 0;
        default:
          throw new Error(`fakeDb: unsupported or op ${op}`);
      }
    };
  });
  return (row) => parts.some((f) => f(row));
}

export function fakeDb(seed: Record<string, Row[]> = {}, opts: FakeDbOptions = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => clone(r));
  const inserts: FakeDb["inserts"] = [];
  const deletes: FakeDb["deletes"] = [];
  const now = () => (opts.now?.() ?? new Date()).toISOString();
  const table = (t: string) => (tables[t] ??= []);
  const canSee = (t: string, row: Row) => (opts.visible?.[t] ? opts.visible[t](row) : true);

  function builder(t: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let returning = false;
    let countMode = false;
    let head = false;
    let limitN: number | null = null;
    let orderBy: { col: string; asc: boolean } | null = null;
    const filters: Filter[] = [];

    const run = (): Result => {
      if (op === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Row[];
        if (opts.denyInsert?.has(t)) {
          return { data: null, error: { code: "42501", message: `new row violates row-level security policy for table "${t}"` } };
        }
        const out: Row[] = [];
        for (const r of rows) {
          const row: Row = { id: randomUUID(), created_at: now(), updated_at: now(), ...clone(r) };
          for (const key of opts.unique?.[t] ?? []) {
            const clash = table(t).some((x) => key.every((k) => getPath(x, k) !== null && getPath(x, k) === getPath(row, k)));
            if (clash) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${t}` } };
          }
          table(t).push(row);
          inserts.push({ table: t, row: clone(row) });
          out.push(clone(row));
        }
        return { data: returning ? out : null, error: null };
      }

      let matched = table(t).filter((r) => canSee(t, r) && filters.every((f) => f(r)));
      if (orderBy) {
        const { col, asc } = orderBy;
        matched = [...matched].sort((a, b) => (asc ? 1 : -1) * cmp(getPath(a, col), getPath(b, col)));
      }
      if (limitN !== null) matched = matched.slice(0, limitN);

      if (op === "select") {
        if (head) return { data: null, error: null, count: matched.length };
        return { data: matched.map(clone), error: null, count: countMode ? matched.length : null };
      }
      if (op === "update") {
        for (const r of matched) {
          Object.assign(r, clone(payload as Row));
          if (opts.touchUpdatedAt?.has(t)) r.updated_at = new Date(Date.parse(now()) + Math.floor(Math.random() * 1000) + 1).toISOString();
        }
        return { data: returning ? matched.map(clone) : null, error: null };
      }
      // delete
      if (opts.denyDelete?.has(t)) return { data: returning ? [] : null, error: null };
      tables[t] = table(t).filter((r) => !matched.includes(r));
      for (const r of matched) deletes.push({ table: t, row: clone(r) });
      return { data: returning ? matched.map(clone) : null, error: null };
    };

    const single = (allowNone: boolean): Result => {
      const res = run();
      if (res.error) return res;
      const rows = (res.data as Row[] | null) ?? [];
      if (rows.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
      if (rows.length === 0) return allowNone ? { data: null, error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
      return { data: rows[0], error: null };
    };

    const b = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (op === "select") {
          countMode = !!o?.count;
          head = !!o?.head;
        } else {
          returning = true;
        }
        return b;
      },
      insert(v: Row | Row[]) {
        op = "insert";
        payload = v;
        return b;
      },
      update(v: Row) {
        op = "update";
        payload = v;
        return b;
      },
      delete() {
        op = "delete";
        return b;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => {
          const v = getPath(r, col);
          return v !== null && String(v) === String(val);
        });
        return b;
      },
      neq(col: string, val: unknown) {
        filters.push((r) => String(getPath(r, col)) !== String(val));
        return b;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.map(String).includes(String(getPath(r, col))));
        return b;
      },
      is(col: string, val: null) {
        filters.push((r) => (val === null ? getPath(r, col) === null : getPath(r, col) === val));
        return b;
      },
      contains(col: string, vals: unknown[]) {
        filters.push((r) => {
          const arr = (getPath(r, col) as unknown[] | null) ?? [];
          return vals.every((v) => arr.includes(v));
        });
        return b;
      },
      lt(col: string, val: unknown) {
        filters.push((r) => getPath(r, col) !== null && cmp(getPath(r, col), val) < 0);
        return b;
      },
      lte(col: string, val: unknown) {
        filters.push((r) => getPath(r, col) !== null && cmp(getPath(r, col), val) <= 0);
        return b;
      },
      gt(col: string, val: unknown) {
        filters.push((r) => getPath(r, col) !== null && cmp(getPath(r, col), val) > 0);
        return b;
      },
      gte(col: string, val: unknown) {
        filters.push((r) => getPath(r, col) !== null && cmp(getPath(r, col), val) >= 0);
        return b;
      },
      or(expr: string) {
        filters.push(parseOr(expr));
        return b;
      },
      order(col: string, o?: { ascending?: boolean }) {
        orderBy = { col, asc: o?.ascending !== false };
        return b;
      },
      limit(n: number) {
        limitN = n;
        return b;
      },
      single: () => Promise.resolve(single(false)),
      maybeSingle: () => Promise.resolve(single(true)),
      then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
        try {
          return Promise.resolve(run()).then(resolve, reject);
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return b;
  }

  const client = {
    from: (t: string) => builder(t),
    rpc: async (name: string, args: Record<string, unknown>) =>
      opts.rpc ? opts.rpc(name, args) : { data: null, error: { code: "42883", message: `no rpc ${name}` } },
  };

  return { tables, client, inserts, deletes, opts };
}
