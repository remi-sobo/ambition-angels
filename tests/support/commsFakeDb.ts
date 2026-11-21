/**
 * A small in-memory stand-in for the Supabase query builder, enough for the
 * Comms story-bank code paths: select (with the `consents:story_consents (...)`
 * embed on story_subjects), eq / neq / in / is / not / gte / contains / or /
 * order / limit / range, maybeSingle / single, insert / update / delete, rpc,
 * head counts. Every write is recorded so tests can assert "nothing written".
 */

export type Row = Record<string, unknown>;
export type Write = { table: string; op: "insert" | "update" | "delete"; values?: unknown; filters: Array<[string, string, unknown]> };

type Filter = [op: string, col: string, val: unknown];

export function fakeDb(
  seed: Record<string, Row[]>,
  opts: { failRead?: string[]; failWrite?: string[]; rpc?: Record<string, (args: unknown) => unknown> } = {},
) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const writes: Write[] = [];
  let nextId = 1;

  const match = (r: Row, filters: Filter[]) =>
    filters.every(([op, col, val]) => {
      const key = col.includes("->>") ? col.split("->>") : null;
      const v = key ? ((r[key[0]] as Row | undefined)?.[key[1]] as unknown) : r[col];
      switch (op) {
        case "eq": return v === val;
        case "neq": return v !== val;
        case "in": return (val as unknown[]).includes(v);
        case "is": return val === null ? v === null || v === undefined : v === val;
        case "notnull": return v !== null && v !== undefined;
        case "gte": return typeof val === "number" ? Number(v) >= val : typeof v === "string" && v >= (val as string);
        case "gt": return typeof val === "number" ? Number(v) > val : typeof v === "string" && v > (val as string);
        case "lt": return typeof val === "number" ? Number(v) < val : typeof v === "string" && v < (val as string);
        case "contains": return Array.isArray(v) && (val as unknown[]).every((x) => (v as unknown[]).includes(x));
        default: return true;
      }
    });

  function from(table: string) {
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let values: unknown = null;
    let selectStr = "*";
    let returning = false;
    let head = false;
    let limitN: number | null = null;

    const embed = (rows: Row[]) =>
      rows.map((r) => {
        const out: Row = { ...r };
        if (table === "story_subjects" && /consents:story_consents/.test(selectStr)) {
          out.consents = (tables.story_consents ?? []).filter((c) => c.story_subject_id === r.id).map((c) => ({ ...c }));
        }
        if (/campaign:email_campaigns/.test(selectStr)) {
          const c = (tables.email_campaigns ?? []).find((x) => x.id === r.campaign_id);
          out.campaign = c ? { name: c.name, subject: c.subject } : null;
        }
        return out;
      });

    const run = (): { data: unknown; error: { message: string; code?: string } | null; count?: number } => {
      if (op === "select") {
        if (opts.failRead?.includes(table)) return { data: null, error: { message: "read failed" } };
        let rows = (tables[table] ?? []).filter((r) => match(r, filters));
        if (limitN !== null) rows = rows.slice(0, limitN);
        if (head) return { data: null, error: null, count: rows.length };
        return { data: embed(rows), error: null, count: rows.length };
      }
      if (opts.failWrite?.includes(table)) return { data: null, error: { message: "write failed" } };
      writes.push({ table, op, values, filters: [...filters] });
      if (op === "insert") {
        const list = (Array.isArray(values) ? values : [values]) as Row[];
        const inserted = list.map((v) => ({ id: `id-${nextId++}`, ...v }));
        tables[table] = [...(tables[table] ?? []), ...inserted];
        return { data: returning ? inserted : null, error: null };
      }
      const hit = (tables[table] ?? []).filter((r) => match(r, filters));
      if (op === "update") {
        for (const r of hit) Object.assign(r, values as Row);
        return { data: returning ? hit : null, error: null };
      }
      tables[table] = (tables[table] ?? []).filter((r) => !hit.includes(r));
      return { data: returning ? hit : null, error: null };
    };

    const q = {
      select(s?: string, o?: { head?: boolean }) {
        if (op === "select") selectStr = s ?? "*";
        else returning = true;
        if (o?.head) head = true;
        return q;
      },
      insert(v: unknown) { op = "insert"; values = v; return q; },
      upsert(v: unknown) { op = "insert"; values = v; return q; },
      update(v: unknown) { op = "update"; values = v; return q; },
      delete() { op = "delete"; return q; },
      eq(c: string, v: unknown) { filters.push(["eq", c, v]); return q; },
      neq(c: string, v: unknown) { filters.push(["neq", c, v]); return q; },
      in(c: string, v: unknown[]) { filters.push(["in", c, v]); return q; },
      is(c: string, v: unknown) { filters.push(["is", c, v]); return q; },
      not(c: string, _o: string, v: unknown) { if (v === null) filters.push(["notnull", c, null]); return q; },
      gte(c: string, v: unknown) { filters.push(["gte", c, v]); return q; },
      gt(c: string, v: unknown) { filters.push(["gt", c, v]); return q; },
      lt(c: string, v: unknown) { filters.push(["lt", c, v]); return q; },
      contains(c: string, v: unknown[]) { filters.push(["contains", c, v]); return q; },
      or() { return q; },
      order() { return q; },
      limit(n: number) { limitN = n; return q; },
      range(fromIdx: number, toIdx: number) {
        const r = run();
        const data = Array.isArray(r.data) ? (r.data as Row[]).slice(fromIdx, toIdx + 1) : r.data;
        return Promise.resolve({ ...r, data });
      },
      maybeSingle() {
        const r = run();
        const d = Array.isArray(r.data) ? (r.data as Row[])[0] ?? null : r.data;
        return Promise.resolve({ data: d, error: r.error });
      },
      single() {
        returning = true;
        const r = run();
        const d = Array.isArray(r.data) ? (r.data as Row[])[0] ?? null : r.data;
        return Promise.resolve({ data: d, error: r.error ?? (d ? null : { message: "no row" }) });
      },
      then<T>(res: (v: ReturnType<typeof run>) => T, rej?: (e: unknown) => T) {
        try {
          return Promise.resolve(res(run()));
        } catch (e) {
          return rej ? Promise.resolve(rej(e)) : Promise.reject(e);
        }
      },
    };
    return q;
  }

  const rpc = async (name: string, args: unknown) => {
    const fn = opts.rpc?.[name];
    return fn ? { data: fn(args), error: null } : { data: null, error: null };
  };

  return { client: { from, rpc } as unknown as never, tables, writes };
}
