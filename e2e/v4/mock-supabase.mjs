#!/usr/bin/env node
// BloomOS V4 audit harness: a GoTrue + PostgREST mock on 127.0.0.1:55321.
//
// Serves made-up fixture data (e2e/v4/fixtures) so /admin runs locally with no
// real Supabase. Not a database: no RLS, no triggers, no views computed from
// SQL. See e2e/v4/README.md.
//
// Env:
//   V4_PROFILE   populated (default) | empty
//   V4_ROLE      owner (default) | admin | staff | finance | board_viewer
//   V4_PORT      default 55321
//   V4_LOG_DIR   default e2e/v4/.logs
//   V4_PERSIST   1 = apply writes to the in-memory store (default: discard)
//   V4_DELAY_MS  delay every REST read by N ms (loading-state captures)
//   V4_MFA       two-step login state of the signed-in user:
//                aal2 (default: has an authenticator, sign-in lands at aal2,
//                so every admin page renders as before) | verify (has one,
//                sign-in lands at aal1 → the verify screen) | enroll (none →
//                the enroll screen). Any 6-digit code verifies except 000000.
//   V4_TWO_ORG   1 = two orgs in one store (the demo org + "Lanternfield Youth
//                Alliance (demo)", fixtures/index.mjs buildTwoOrgFixtures), with
//                RLS emulated for session-client reads (see rlsFilter below)
//   V4_ORG       a (default) | b: which org's owner is signed in (two-org mode)
// Runtime control (no restart): POST /__mock/config with JSON
//   { delayMs, delayPattern, failWrite, failRead, role, profile, org, twoOrg, mfa }
//   (setting mfa also resets the user's authenticators to match it)
//   failWrite/failRead: a table name, an rpc name, or "*". GET /__mock/config reads it.
//   GET /__mock/coverage returns the coverage log so far.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildFixtures, buildTwoOrgFixtures, DEMO } from "./fixtures/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.V4_PORT || 55321);
const LOG_DIR = process.env.V4_LOG_DIR || path.join(here, ".logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const schema = JSON.parse(fs.readFileSync(path.join(here, "fixtures/schema.json"), "utf8"));
const fks = JSON.parse(fs.readFileSync(path.join(here, "fixtures/fks.json"), "utf8"));

const config = {
  profile: process.env.V4_PROFILE || "populated",
  role: process.env.V4_ROLE || "owner",
  delayMs: Number(process.env.V4_DELAY_MS || 0),
  delayPattern: null, // regex string on table name; null = all
  failWrite: null,
  failRead: null,
  persist: process.env.V4_PERSIST === "1",
  mfa: process.env.V4_MFA || "aal2",
  twoOrg: process.env.V4_TWO_ORG === "1",
  org: process.env.V4_ORG || "a",
};

// who is signed in: the demo org's first team member, or in two-org mode the
// first team member of the org named by config.org
let who = { user: DEMO.user, team: DEMO.team, orgId: DEMO.org.id };
let fx;
function rebuild() {
  if (config.twoOrg) {
    fx = buildTwoOrgFixtures({ profile: config.profile, role: config.role, org: config.org });
    who = { user: fx.user, team: fx.team, orgId: fx.orgId };
  } else {
    fx = buildFixtures({ profile: config.profile, role: config.role });
    who = { user: DEMO.user, team: DEMO.team, orgId: DEMO.org.id };
  }
}
rebuild();

// RLS, roughly, for two-org mode: a read made with a signed-in user's JWT (the
// session client) only sees rows of orgs that user belongs to. Reads made with
// the service-role key see everything, exactly like production, so a page
// that reads with the service role and forgets its org filter shows the other
// org's rows: that is the leak the two-org pass looks for.
function bearerRole(req) {
  const tok = (req.headers.authorization || "").replace(/^Bearer /i, "");
  return decodeJwt(tok)?.role || null;
}
// Per-table read permissions, roughly as the policies have them: every
// `create policy ... for select|all ... has_permission(org_id, '<perm>')` in
// supabase/migrations, plus the tables whose policies are made in loops
// (named here by prefix). A session read of such a table by a role holding
// none of its permissions gets no rows, as RLS would give it. Auth tables
// keep their own-row policies and are never narrowed here.
const RLS_PERMS = (() => {
  const map = {};
  const dir = path.join(here, "../../supabase/migrations");
  const re = /create\s+policy\s+"?[^"]*"?\s+on\s+(?:public\.)?(\w+)\s+(?:as\s+\w+\s+)?for\s+(?:select|all)\b[\s\S]{0,80}?using\s*\(\s*\(?\s*(?:select\s+)?private\.has_permission\(\s*org_id\s*,\s*'([\w.]+)'/gi;
  try {
    for (const f of fs.readdirSync(dir).sort()) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      let m;
      while ((m = re.exec(sql))) (map[m[1]] ||= new Set()).add(m[2]);
    }
  } catch {}
  const prefix = [
    [/^(constituents|gifts|soft_credits|pledges|pledge_payments|recurring_plans|opportunities|asks|grants|grant_requirements|campaigns|appeals|funds|households|interactions|segments|email_campaigns|email_sends|fr_)/, "fundraising.read"],
    [/^(students|cohorts|cohort_members|cohort_sessions|attendance|programs|partners|partner_contacts|applications|participants)/, "program.read"],
    [/^(ops_|work_)/, "ops.read"],
    [/^fin_/, "finance.read"],
    [/^board_/, "board.read"],
    [/^compliance_/, "compliance.read"],
  ];
  const AUTH = new Set(["memberships", "orgs", "profiles", "org_entitlements", "role_permissions", "entity_types", "org_terminology", "invitations"]);
  return (table) => {
    if (AUTH.has(table)) return null;
    const perms = new Set(map[table] || []);
    for (const [re2, perm] of prefix) if (re2.test(table)) perms.add(perm);
    return perms.size ? perms : null;
  };
})();
function rlsFilter(req, rows, table) {
  if (!config.twoOrg || bearerRole(req) !== "authenticated") return rows;
  const need = table ? RLS_PERMS(table) : null;
  if (need) {
    const held = new Set((fx.tables.role_permissions || []).filter((r) => r.role === config.role).map((r) => r.permission));
    if (![...need].some((p) => held.has(p))) return [];
  }
  const mine = new Set((fx.tables.memberships || []).filter((m) => m.user_id === who.user.id).map((m) => m.org_id));
  return rows.filter((r) => !r || typeof r !== "object" || !("org_id" in r) || r.org_id == null || mine.has(r.org_id));
}

// ── coverage log ────────────────────────────────────────────────────────────
const coverage = { tables: {}, rpcs: {}, other: {} };
function note(kind, name, info) {
  const bucket = coverage[kind];
  const e = (bucket[name] ||= { hits: 0, empty: 0, inSchema: kind === "tables" ? !!schema[name] : undefined, selects: [], filtersIgnored: [] });
  e.hits++;
  if (info?.empty) e.empty++;
  if (info?.select && e.selects.length < 8 && !e.selects.includes(info.select)) e.selects.push(info.select);
  if (info?.ignored) for (const i of info.ignored) if (!e.filtersIgnored.includes(i) && e.filtersIgnored.length < 10) e.filtersIgnored.push(i);
  scheduleFlush();
}
let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const noFixture = {
      tables: Object.entries(coverage.tables).filter(([t]) => !(fx.tables[t]?.length)).map(([t, e]) => ({ table: t, hits: e.hits, inSchema: e.inSchema })),
      rpcs: Object.entries(coverage.rpcs).filter(([, e]) => e.defaulted).map(([r, e]) => ({ rpc: r, hits: e.hits })),
    };
    fs.writeFileSync(path.join(LOG_DIR, `coverage-${config.profile}.json`), JSON.stringify(coverage, null, 1));
    fs.writeFileSync(path.join(LOG_DIR, `no-fixture-${config.profile}.json`), JSON.stringify(noFixture, null, 1));
  }, 500);
}

// ── auth ────────────────────────────────────────────────────────────────────
// Two-step login (lib/auth/twoStep.ts): the demo user's authenticators, and
// whether the current session has passed the second step.
let factors = [];
let sessionAal = "aal1";
function resetMfa() {
  factors =
    config.mfa === "enroll"
      ? []
      : [{ id: "f0000000-0000-4000-8000-000000000001", friendly_name: "Authenticator app", factor_type: "totp", status: "verified", created_at: "2026-11-02T17:00:00Z", updated_at: "2026-11-02T17:00:00Z" }];
  sessionAal = config.mfa === "aal2" ? "aal2" : "aal1";
}
resetMfa();
// A made-up QR-looking SVG (deterministic squares); not scannable.
function fakeQrSvg(seed) {
  const n = 21;
  let cells = "";
  const h = crypto.createHash("sha256").update(seed).digest();
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      const on = finder ? (x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5) || x === 20 || y === 20 || x === 14 || y === 14) : (h[(y * n + x) % 32] >> (x % 8)) & 1;
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><g fill="#000">${cells}</g></svg>`;
}
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function fakeJwt(payload) {
  return `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(payload)}.sig`;
}
function decodeJwt(tok) {
  try {
    return JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}
function authUser() {
  const u = who.user;
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: "2026-01-05T16:00:00Z",
    phone: "",
    confirmed_at: "2026-01-05T16:00:00Z",
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: u.displayName },
    identities: [],
    created_at: "2026-01-05T16:00:00Z",
    updated_at: new Date().toISOString(),
    factors,
  };
}
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
  return {
    access_token: fakeJwt({ sub: who.user.id, role: "authenticated", aud: "authenticated", email: who.user.email, exp, aal: sessionAal, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }].concat(sessionAal === "aal2" ? [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }] : []) }),
    token_type: "bearer",
    expires_in: 3600 * 24 * 365,
    expires_at: exp,
    refresh_token: "v4-mock-refresh",
    user: authUser(),
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  const h = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
    "access-control-expose-headers": "content-range, content-profile",
    ...headers,
  };
  if (body === undefined || body === null) {
    res.writeHead(status, h);
    return res.end();
  }
  const s = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...h });
  res.end(s);
}
const readBody = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const matchesFail = (setting, name) => setting && (setting === "*" || setting === name || new RegExp(`^(${setting})$`).test(name));

// split on top-level commas (ignoring those inside parentheses / quotes)
function splitTop(s, sep = ",") {
  const out = [];
  let depth = 0, cur = "", q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && depth === 0 && ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur !== "") out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// ── select parsing + embedding ──────────────────────────────────────────────
function parseSelect(sel) {
  if (!sel) return { star: true, aliases: [], embeds: [] };
  const toks = splitTop(sel.replace(/\s+/g, " "));
  const out = { star: false, aliases: [], embeds: [] };
  for (let t of toks) {
    const p = t.indexOf("(");
    if (p !== -1 && t.endsWith(")")) {
      let head = t.slice(0, p).trim();
      const inner = t.slice(p + 1, -1);
      let spread = false;
      if (head.startsWith("...")) {
        spread = true;
        head = head.slice(3);
      }
      // aggregate like amount.sum() / count()
      if (inner === "" && /\.(sum|avg|min|max|count)$|^count$/.test(head)) continue;
      let alias = null;
      if (head.includes(":")) [alias, head] = head.split(":").map((x) => x.trim());
      const [rel, ...hints] = head.split("!");
      out.embeds.push({ alias: alias || rel, rel, hints: hints.filter((h) => h !== "inner" && h !== "left"), inner: parseSelect(inner), spread, innerJoin: hints.includes("inner") });
      continue;
    }
    if (t === "*") {
      out.star = true;
      continue;
    }
    // alias:col, col::cast, col->>key
    let alias = null;
    let expr = t;
    if (t.includes(":") && !t.startsWith(":")) {
      const i = t.indexOf(":");
      if (t[i + 1] !== ":") {
        alias = t.slice(0, i).trim();
        expr = t.slice(i + 1).trim();
      }
    }
    expr = expr.replace(/::[a-z_0-9\[\]]+$/i, "");
    const json = expr.match(/^([a-z_0-9]+)->>?'?([a-z_0-9]+)'?/i);
    if (json) out.aliases.push({ alias: alias || json[2], col: json[1], key: json[2] });
    else if (alias) out.aliases.push({ alias, col: expr });
  }
  return out;
}

function fkBetween(from, to, hint) {
  // FK on `from` pointing at `to` (many-to-one from `from`'s side)
  return fks.filter((f) => f.from === from && f.to === to && (!hint || f.col === hint || hint.includes(f.col)));
}

function resolveEmbed(base, emb) {
  let target = emb.rel;
  const hint = emb.hints[0];
  // embed by FK column name: owner:owner_id(...) → the FK's target table
  if (!schema[target] && !fx.tables[target]) {
    const viaCol = fks.find((f) => f.from === base && f.col === target);
    if (viaCol) return { table: viaCol.to, kind: "one", col: viaCol.col, tocol: viaCol.tocol };
  }
  // hint may be a column name on base (rel!owner_id)
  let m2o = fkBetween(base, target, hint);
  if (m2o.length) return { table: target, kind: "one", col: m2o[0].col, tocol: m2o[0].tocol };
  let o2m = fks.filter((f) => f.from === target && f.to === base && (!hint || f.col === hint || hint.includes(f.col)));
  if (o2m.length) return { table: target, kind: "many", col: o2m[0].col, tocol: o2m[0].tocol };
  // heuristics when the FK is not declared in migrations
  const cols = new Set((schema[base] || []).map((c) => c.n));
  const single = target.replace(/ies$/, "y").replace(/s$/, "");
  for (const c of [hint, `${single}_id`, `${target}_id`]) if (c && cols.has(c)) return { table: target, kind: "one", col: c, tocol: "id" };
  const tcols = new Set((schema[target] || []).map((c) => c.n));
  const bsingle = base.replace(/ies$/, "y").replace(/s$/, "");
  if (tcols.has(`${bsingle}_id`)) return { table: target, kind: "many", col: `${bsingle}_id`, tocol: "id" };
  return null;
}

function shapeRows(table, rows, sel, depth = 0) {
  if (!sel || (sel.star && !sel.aliases.length && !sel.embeds.length)) return rows.map((r) => ({ ...r }));
  return rows.map((r) => {
    const o = { ...r };
    for (const a of sel.aliases) {
      let v = r[a.col];
      if (a.key) {
        if (typeof v === "string") try { v = JSON.parse(v); } catch {}
        v = v && typeof v === "object" ? v[a.key] ?? null : null;
      }
      o[a.alias] = v ?? null;
    }
    for (const e of sel.embeds) {
      if (depth > 4) continue;
      const rel = resolveEmbed(table, e);
      let val;
      if (!rel) {
        val = [];
        note("other", `embed:${table}->${e.rel}`, {});
      } else {
        const trows = fx.tables[rel.table] || [];
        if (rel.kind === "one") {
          const hit = r[rel.col] == null ? null : trows.find((t) => String(t[rel.tocol]) === String(r[rel.col]));
          val = hit ? shapeRows(rel.table, [hit], e.inner, depth + 1)[0] : null;
        } else {
          const hits = trows.filter((t) => String(t[rel.col]) === String(r[rel.tocol]));
          if (e.inner.embeds.length === 0 && e.inner.aliases.length === 0 && !e.inner.star && /count/.test(JSON.stringify(e))) val = [{ count: hits.length }];
          else val = shapeRows(rel.table, hits, e.inner, depth + 1);
        }
      }
      if (e.spread && val && !Array.isArray(val)) Object.assign(o, val);
      else o[e.alias] = val;
    }
    return o;
  });
}

// ── filters ─────────────────────────────────────────────────────────────────
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
const unq = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);
function cmp(a, b) {
  if (a == null || b == null) return NaN;
  if (typeof a === "boolean") a = String(a);
  const na = Number(a), nb = Number(b);
  if (a !== "" && b !== "" && !isNaN(na) && !isNaN(nb) && typeof a !== "object") return na - nb;
  const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
  // normalise dates: "2026-01-01" vs "2026-01-01T..." compare lexically fine
  return sa < String(b) ? -1 : sa > String(b) ? 1 : 0;
}
function likeRe(pat, ci) {
  const s = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${s}$`, ci ? "is" : "s");
}
function parseList(v) {
  // (a,b,"c d") or {a,b}
  const inner = v.replace(/^[({]/, "").replace(/[)}]$/, "");
  return splitTop(inner).map(unq);
}
function testOp(val, op, arg) {
  switch (op) {
    case "eq": return val != null && (String(val) === arg || cmp(val, arg) === 0);
    case "neq": return val != null && String(val) !== arg;
    case "gt": return cmp(val, arg) > 0;
    case "gte": return cmp(val, arg) >= 0;
    case "lt": return cmp(val, arg) < 0;
    case "lte": return cmp(val, arg) <= 0;
    case "like": return val != null && likeRe(arg, false).test(String(val));
    case "ilike": return val != null && likeRe(arg, true).test(String(val));
    case "match": return val != null && new RegExp(arg).test(String(val));
    case "imatch": return val != null && new RegExp(arg, "i").test(String(val));
    case "is":
      if (arg === "null") return val == null;
      if (arg === "true") return val === true;
      if (arg === "false") return val === false;
      return val == null;
    case "isdistinct": return String(val) !== arg;
    case "in": return val != null && parseList(arg).some((x) => String(val) === x);
    case "cs": {
      const want = arg.startsWith("{") || arg.startsWith("(") ? parseList(arg) : (() => { try { return JSON.parse(arg); } catch { return [arg]; } })();
      if (Array.isArray(val)) return (Array.isArray(want) ? want : [want]).every((w) => val.map(String).includes(String(w)));
      if (val && typeof val === "object" && want && typeof want === "object" && !Array.isArray(want)) return Object.entries(want).every(([k, v]) => JSON.stringify(val[k]) === JSON.stringify(v));
      return false;
    }
    case "cd": return Array.isArray(val) && val.every((x) => parseList(arg).includes(String(x)));
    case "ov": return Array.isArray(val) && parseList(arg).some((x) => val.map(String).includes(x));
    case "fts": case "plfts": case "phfts": case "wfts": return val != null && String(val).toLowerCase().includes(arg.toLowerCase().split(/[ &|]/)[0]);
    default: return true;
  }
}
// "col.op.value" or "col.not.op.value" (inside or=(...)) ; "op.value" for query params
function evalCond(row, col, expr, ignored) {
  let neg = false;
  let parts = expr.split(".");
  if (parts[0] === "not") {
    neg = true;
    parts = parts.slice(1);
  }
  let op = parts[0];
  let arg = parts.slice(1).join(".");
  // fts(config).value
  op = op.replace(/\(.*\)$/, "");
  if (!(col in row)) {
    ignored?.add(col);
    return true;
  }
  const r = testOp(row[col], op, unq(arg));
  return neg ? !r : r;
}
function evalLogic(row, kind, inner, ignored) {
  const items = splitTop(inner.replace(/^\(/, "").replace(/\)$/, ""));
  const results = items.map((it) => {
    const m = it.match(/^(not\.)?(or|and)\((.*)\)$/s);
    if (m) {
      const r = evalLogic(row, m[2], `(${m[3]})`, ignored);
      return m[1] ? !r : r;
    }
    const i = it.indexOf(".");
    const col = it.slice(0, i);
    if (col.includes("->")) return true;
    return evalCond(row, col, it.slice(i + 1), ignored);
  });
  return kind === "or" ? results.some(Boolean) : results.every(Boolean);
}
function applyFilters(rows, params, ignored) {
  const conds = [];
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    if (k === "or" || k === "and" || k === "not.or" || k === "not.and") {
      const neg = k.startsWith("not.");
      const kind = neg ? k.slice(4) : k;
      conds.push((r) => {
        const x = evalLogic(r, kind, v, ignored);
        return neg ? !x : x;
      });
      continue;
    }
    if (k.endsWith(".or") || k.endsWith(".and") || k.includes(".")) {
      // filter on an embedded resource (rel.col=...) — ignored by the mock
      ignored.add(k);
      continue;
    }
    let col = k;
    if (col.includes("->")) {
      // json path filter: metadata->>key=eq.x
      const m = col.match(/^([a-z_0-9]+)->>?'?([a-z_0-9]+)'?$/i);
      if (!m) { ignored.add(k); continue; }
      conds.push((r) => {
        let obj = r[m[1]];
        if (typeof obj === "string") try { obj = JSON.parse(obj); } catch {}
        const val = obj && typeof obj === "object" ? obj[m[2]] : undefined;
        return evalCond({ x: val === undefined ? null : val }, "x", v, ignored);
      });
      continue;
    }
    conds.push((r) => evalCond(r, col, v, ignored));
  }
  return rows.filter((r) => conds.every((c) => c(r)));
}
function applyOrder(rows, order) {
  if (!order) return rows;
  const keys = splitTop(order).map((o) => {
    const [col, ...mods] = o.split(".");
    return { col, desc: mods.includes("desc"), nullsFirst: mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : null };
  }).filter((k) => !k.col.includes("("));
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const av = a[k.col], bv = b[k.col];
      if (av == null && bv == null) continue;
      const nf = k.nullsFirst ?? k.desc; // PostgREST: nulls last asc, first desc
      if (av == null) return nf ? -1 : 1;
      if (bv == null) return nf ? 1 : -1;
      const c = cmp(av, bv);
      if (c !== 0 && !isNaN(c)) return k.desc ? -c : c;
    }
    return 0;
  });
}

// ── row completion for writes ───────────────────────────────────────────────
function completeRow(table, row) {
  const out = { ...row };
  if (!("id" in out)) {
    const idcol = (schema[table] || []).find((c) => c.n === "id");
    if (!idcol || idcol.t === "uuid") out.id = crypto.randomUUID();
    else if (/int/.test(idcol.t)) out.id = Math.floor(Math.random() * 1e6);
    else out.id = crypto.randomUUID();
  }
  const now = new Date().toISOString();
  for (const c of schema[table] || []) {
    if (c.n in out) continue;
    if (c.n === "created_at" || c.n === "updated_at") out[c.n] = now;
    else if (c.n === "org_id") out[c.n] = who.orgId;
    else out[c.n] = null;
  }
  return out;
}

// ── RPC ─────────────────────────────────────────────────────────────────────
function rpc(name, args) {
  if (name in fx.rpcs) {
    note("rpcs", name, {});
    const v = fx.rpcs[name];
    return typeof v === "function" ? v(args, fx, config) : v;
  }
  const e = (coverage.rpcs[name] ||= { hits: 0 });
  e.defaulted = true;
  note("rpcs", name, {});
  if (/count$/.test(name)) return 0;
  if (/^(has_|can_|is_)/.test(name)) return false;
  return [];
}

// ── server ──────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204);

  try {
    // control plane
    if (p === "/__mock/config") {
      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const needRebuild = (body.role && body.role !== config.role) || (body.profile && body.profile !== config.profile) || (body.org && body.org !== config.org) || ("twoOrg" in body && body.twoOrg !== config.twoOrg) || body.reset;
        delete body.reset;
        Object.assign(config, body);
        if (needRebuild) rebuild();
        if (body.mfa) resetMfa();
      }
      return send(res, 200, config);
    }
    if (p === "/__mock/coverage") return send(res, 200, coverage);
    if (p === "/__mock/health") return send(res, 200, { ok: true, profile: config.profile, role: config.role, org: config.org, twoOrg: config.twoOrg });

    // GoTrue
    if (p.startsWith("/auth/v1/")) {
      const sub = p.slice("/auth/v1/".length);
      const authBody = await readBody(req);
      if (sub === "token") {
        // A fresh password sign-in starts at aal1 unless the mock is set to
        // aal2; a refresh keeps whatever the session already reached.
        if (url.searchParams.get("grant_type") === "password") sessionAal = config.mfa === "aal2" ? "aal2" : "aal1";
        return send(res, 200, session());
      }
      // MFA (TOTP): enroll, challenge, verify, unenroll for the demo user.
      if (sub === "factors" && req.method === "POST") {
        const b = JSON.parse(authBody || "{}");
        if (factors.some((f) => f.friendly_name === b.friendly_name))
          return send(res, 422, { code: 422, error_code: "mfa_factor_name_conflict", msg: "A factor with the friendly name already exists" });
        const f = { id: crypto.randomUUID(), friendly_name: b.friendly_name ?? null, factor_type: "totp", status: "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        factors.push(f);
        const secret = "JBSWY3DPEHPK3PXPMOCKV4ANEXAMPLE";
        return send(res, 200, { id: f.id, type: "totp", friendly_name: f.friendly_name, totp: { qr_code: fakeQrSvg(f.id), secret, uri: `otpauth://totp/BloomOS:${DEMO.user.email}?secret=${secret}&issuer=BloomOS` } });
      }
      const fm = sub.match(/^factors\/([^/]+)(?:\/(challenge|verify))?$/);
      if (fm) {
        const f = factors.find((x) => x.id === fm[1]);
        if (!f) return send(res, 404, { code: 404, error_code: "mfa_factor_not_found", msg: "Factor not found" });
        if (req.method === "DELETE") {
          factors = factors.filter((x) => x.id !== f.id);
          return send(res, 200, { id: f.id });
        }
        if (fm[2] === "challenge") return send(res, 200, { id: crypto.randomUUID(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
        if (fm[2] === "verify") {
          const b = JSON.parse(authBody || "{}");
          if (!/^\d{6}$/.test(b.code || "") || b.code === "000000")
            return send(res, 422, { code: 422, error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" });
          f.status = "verified";
          sessionAal = "aal2";
          return send(res, 200, session());
        }
      }
      // Auth admin API (Settings → People and roles): team members as auth
      // users; the last one has never signed in, so the screen shows an open
      // invite. POST /invite returns a new invented user.
      // Two-step: the demo user's own factors; everyone else has one
      // verified authenticator except the second person and the open invite.
      const teamFactors = (p, i) =>
        p.id === DEMO.user.id ? factors : i === 1 || i === DEMO.team.length - 1 ? [] : [{ id: `f${String(i).padStart(7, "0")}-0000-4000-8000-00000000000${i % 10}`, friendly_name: "Authenticator app", factor_type: "totp", status: "verified", created_at: "2026-11-02T17:00:00Z", updated_at: "2026-11-02T17:00:00Z" }];
      const teamUser = (p, i) => ({
        id: p.id, aud: "authenticated", role: "authenticated", email: p.email,
        created_at: "2024-08-01T17:00:00Z",
        last_sign_in_at: i === who.team.length - 1 ? null : new Date(Date.now() - i * 86400000).toISOString(),
        app_metadata: {}, user_metadata: {},
        factors: teamFactors(p, i),
      });
      const am = sub.match(/^admin\/users\/([^/]+)\/factors(?:\/([^/]+))?$/);
      if (am) {
        const i = DEMO.team.findIndex((p) => p.id === am[1]);
        if (i < 0) return send(res, 404, { code: 404, msg: "User not found" });
        if (req.method === "DELETE") {
          if (am[1] === DEMO.user.id) factors = factors.filter((x) => x.id !== am[2]);
          return send(res, 200, { id: am[2] });
        }
        return send(res, 200, teamFactors(DEMO.team[i], i));
      }
      if (sub.startsWith("admin/users/")) {
        const id = sub.slice("admin/users/".length);
        const i = who.team.findIndex((p) => p.id === id);
        return i < 0 ? send(res, 404, { code: 404, msg: "User not found" }) : send(res, 200, teamUser(who.team[i], i));
      }
      if (sub === "admin/users") return send(res, 200, { users: who.team.map(teamUser), aud: "authenticated" });
      if (sub === "invite") {
        const b = JSON.parse(authBody || "{}");
        return send(res, 200, { id: crypto.randomUUID(), aud: "authenticated", role: "authenticated", email: b.email, invited_at: new Date().toISOString(), last_sign_in_at: null, app_metadata: {}, user_metadata: {} });
      }
      if (sub === "user") {
        const tok = (req.headers.authorization || "").replace(/^Bearer /i, "");
        const claims = decodeJwt(tok);
        if (!claims || claims.role !== "authenticated") return send(res, 401, { code: 401, error_code: "no_authorization", msg: "no user" });
        return send(res, 200, authUser());
      }
      if (sub === "logout") return send(res, 204);
      if (sub === "settings") return send(res, 200, { external: { email: true }, disable_signup: true });
      return send(res, 200, {});
    }

    // Storage
    if (p.startsWith("/storage/v1/")) {
      note("other", `storage:${p.split("/").slice(3, 5).join("/")}`, {});
      if (p.includes("/object/list/")) return send(res, 200, []);
      if (p.includes("/object/sign/")) return send(res, 200, { signedURL: "/v4-mock-file.pdf" });
      return send(res, 404, { statusCode: "404", error: "not_found", message: "mock storage" });
    }

    // PostgREST
    if (p.startsWith("/rest/v1/")) {
      const name = decodeURIComponent(p.slice("/rest/v1/".length));
      const params = [...url.searchParams.entries()];
      const accept = req.headers.accept || "";
      const prefer = req.headers.prefer || "";
      const single = accept.includes("vnd.pgrst.object");
      const isRead = req.method === "GET" || req.method === "HEAD";

      if (name.startsWith("rpc/")) {
        const fn = name.slice(4);
        const raw = req.method === "GET" ? Object.fromEntries(params) : JSON.parse((await readBody(req)) || "{}");
        if (matchesFail(config.failRead, fn)) return send(res, 500, { code: "XX000", message: `v4 mock: forced failure on rpc ${fn}`, details: null, hint: null });
        if (config.delayMs && (!config.delayPattern || new RegExp(config.delayPattern).test(fn))) await sleep(config.delayMs);
        let out = rpc(fn, raw);
        if (Array.isArray(out)) {
          out = applyOrder(applyFilters(out, params.filter(([k]) => k !== "select"), new Set()), url.searchParams.get("order"));
          if (single) {
            if (out.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${out.length} rows`, hint: null });
            out = out[0];
          }
        }
        return send(res, 200, out === undefined ? null : out);
      }

      const table = name;
      const sel = parseSelect(url.searchParams.get("select"));
      const ignored = new Set();

      if (isRead) {
        if (matchesFail(config.failRead, table)) return send(res, 500, { code: "XX000", message: `v4 mock: forced read failure on ${table}`, details: null, hint: null });
        if (config.delayMs && (!config.delayPattern || new RegExp(config.delayPattern).test(table))) await sleep(config.delayMs);
        const all = rlsFilter(req, fx.tables[table] || [], table);
        let rows = applyFilters(all, params, ignored);
        // !inner embeds: drop parents whose embed resolves empty (best effort)
        rows = applyOrder(rows, url.searchParams.get("order"));
        const total = rows.length;
        let offset = Number(url.searchParams.get("offset") || 0);
        let limit = url.searchParams.get("limit") != null ? Number(url.searchParams.get("limit")) : null;
        const range = req.headers.range;
        if (range && /^\d+-\d*$/.test(range)) {
          const [a, b] = range.split("-");
          offset = Number(a);
          if (b !== "") limit = Number(b) - offset + 1;
        }
        rows = rows.slice(offset, limit == null ? undefined : offset + limit);
        let shaped = shapeRows(table, rows, sel);
        for (const e of sel.embeds) if (e.innerJoin) shaped = shaped.filter((r) => (Array.isArray(r[e.alias]) ? r[e.alias].length : r[e.alias]));
        note("tables", table, { empty: all.length === 0, select: url.searchParams.get("select"), ignored: [...ignored] });
        const headers = {};
        if (/count=(exact|planned|estimated)/.test(prefer)) {
          headers["content-range"] = shaped.length ? `${offset}-${offset + shaped.length - 1}/${total}` : `*/${total}`;
        } else headers["content-range"] = shaped.length ? `${offset}-${offset + shaped.length - 1}/*` : "*/*";
        if (req.method === "HEAD") return send(res, 200, null, headers);
        if (single) {
          if (shaped.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${shaped.length} rows`, hint: null }, headers);
          return send(res, 200, shaped[0], headers);
        }
        return send(res, 200, shaped, headers);
      }

      // writes
      const raw = await readBody(req);
      note("tables", table, { select: `WRITE ${req.method}` });
      if (matchesFail(config.failWrite, table)) return send(res, 500, { code: "XX000", message: `v4 mock: forced write failure on ${table}`, details: null, hint: null });
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch {}
      // every write is logged (body + filters) so a capture can assert what the app sent
      fs.appendFileSync(path.join(LOG_DIR, "writes.jsonl"), JSON.stringify({ at: new Date().toISOString(), method: req.method, table, query: url.search, body }) + "\n");
      const wantRep = prefer.includes("return=representation");
      let out = [];
      if (req.method === "POST" || req.method === "PUT") {
        const list = Array.isArray(body) ? body : body ? [body] : [];
        out = list.map((r) => completeRow(table, r));
        // Upserts (Prefer: resolution=merge-duplicates / ignore-duplicates)
        // merge on on_conflict keys instead of appending a second copy.
        const conflict = (url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
        const merging = prefer.includes("resolution=merge-duplicates");
        const ignoring = prefer.includes("resolution=ignore-duplicates");
        if (config.persist && conflict.length && (merging || ignoring)) {
          const rows = (fx.tables[table] ||= []);
          out = list.map((r) => {
            const hit = rows.find((x) => conflict.every((k) => x[k] != null && x[k] === r[k]));
            if (hit) {
              if (merging) Object.assign(hit, r);
              return hit;
            }
            const row = completeRow(table, r);
            rows.push(row);
            return row;
          });
        } else if (config.persist) (fx.tables[table] ||= []).push(...out);
      } else if (req.method === "PATCH") {
        const hits = applyFilters(fx.tables[table] || [], params, ignored);
        out = hits.map((r) => ({ ...r, ...body }));
        if (config.persist) hits.forEach((r) => Object.assign(r, body));
        if (!hits.length && body) out = [];
      } else if (req.method === "DELETE") {
        const hits = applyFilters(fx.tables[table] || [], params, ignored);
        out = hits;
        if (config.persist) fx.tables[table] = (fx.tables[table] || []).filter((r) => !hits.includes(r));
      }
      const status = req.method === "POST" ? 201 : 200;
      if (!wantRep) return send(res, req.method === "POST" ? 201 : 204);
      const shaped = shapeRows(table, out, sel);
      if (single) {
        if (shaped.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${shaped.length} rows`, hint: null });
        return send(res, status, shaped[0]);
      }
      return send(res, status, shaped);
    }

    if (p.startsWith("/realtime/")) return send(res, 404, { message: "v4 mock: realtime not supported" });
    note("other", `unhandled:${req.method} ${p}`, {});
    return send(res, 404, { message: "v4 mock: unhandled path" });
  } catch (err) {
    console.error("[mock] error", req.method, req.url, err);
    return send(res, 500, { code: "MOCK", message: String(err && err.message) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[v4 mock] listening on http://127.0.0.1:${PORT} profile=${config.profile} role=${config.role}`);
  const tableCount = Object.values(fx.tables).filter((r) => r.length).length;
  console.log(`[v4 mock] ${tableCount} tables with fixture rows; logs → ${LOG_DIR}`);
});

export { config };
