import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Source-level safety net for pre-SafeSpace hardening item 3: roles must be
// enforced on the server, not only in the menu.
//
// The service-role client bypasses RLS, so the has_permission() check every
// policy carries is skipped. This test fails CI when:
//   1. an /api/admin route handler exporting POST/PUT/PATCH/DELETE runs on
//      the service role and that HANDLER (not just the file) doesn't call the
//      role guard first;
//   2. a file under app/admin imports the service-role client and doesn't call
//      the page guard;
//   3. any app or lib code writes org_entitlements (only an operator may grant
//      entitlements — see the note at the bottom).
//
// A guard is requirePermission / requireModule (lib/admin/requirePermission.ts),
// ctxHasPermission (the older inline form the plan/* routes use), or
// requireAaOnly(..., { write: true }) (lib/admin/aaOnly.ts, which checks
// program.write). Pages use requirePagePermission / <PermissionGate>.

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split("\\").join("/");

/** Drop comments so a doc mention of getSupabaseAdmin or the guard can't
 *  satisfy (or trip) the check. Rough but enough for this codebase. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

// Lib modules that WRITE through the service role on the caller's behalf. A
// route importing one is held to the same rule as one importing the client.
const SERVICE_ROLE_WRITE_LIBS = [
  "@/lib/admin/finance", // upsertFinConfig: the cash anchor
  "@/lib/hubspot/sync-engine",
  "@/lib/admin/briefing/gather",
];

const usesServiceRole = (src: string) =>
  /from "@\/lib\/supabase\/admin"/.test(src) ||
  SERVICE_ROLE_WRITE_LIBS.some((m) => src.includes(`from "${m}"`));

const ROUTE_GUARD =
  /\brequirePermission\(|\brequireModule\(|\bctxHasPermission\(|\brequireAaOnly\([^)]*write:\s*true/;
const PAGE_GUARD = /\brequirePagePermission\(|<PermissionGate\b|\brequirePermission\(|\bctxHasPermission\(/;

/**
 * Service-role write handlers that are deliberately NOT role-gated. Keep this
 * short, and say why for each one.
 */
const ROUTE_ALLOW: Record<string, string> = {
  // The in-app "Report a problem" FAB: every member, whatever their role, may
  // file a bug. It writes only a task into the org's own BloomOS Upgrades
  // project and a photo into the private reports bucket.
  "app/api/admin/report/route.ts": "any member may report a problem",
};

/** app/admin files on the service role that need no page guard. */
const PAGE_ALLOW: Record<string, string> = {};

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type Handler = { method: string; body: string };

/** Split a route file into its exported handlers (export → next export). */
function handlers(src: string): Handler[] {
  const re = /export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b|export const (GET|POST|PUT|PATCH|DELETE)\b/g;
  const hits = Array.from(src.matchAll(re)).map((m) => ({ i: m.index ?? 0, method: m[1] ?? m[2] }));
  return hits.map((h, k) => ({ method: h.method, body: src.slice(h.i, hits[k + 1]?.i ?? src.length) }));
}

const routeFiles = walk(join(ROOT, "app/api/admin")).filter((p) => p.endsWith("/route.ts"));
const adminFiles = walk(join(ROOT, "app/admin"));

describe("role guard coverage: /api/admin service-role writes", () => {
  test("every service-role write handler checks a role permission first", () => {
    const missing: string[] = [];
    let guarded = 0;
    for (const file of routeFiles) {
      const r = rel(file);
      const src = stripComments(readFileSync(file, "utf8"));
      if (!usesServiceRole(src) || ROUTE_ALLOW[r]) continue;
      for (const h of handlers(src)) {
        if (!WRITE.has(h.method)) continue;
        if (ROUTE_GUARD.test(h.body)) guarded++;
        else missing.push(`${r} ${h.method}`);
      }
    }
    expect(missing, "add requirePermission(<module write perm>) at the top of these handlers").toEqual([]);
    // Sanity: the scan found the routes it's meant to cover.
    expect(guarded).toBeGreaterThan(100);
  });

  test("the allow-list only names real, service-role files", () => {
    for (const r of Object.keys(ROUTE_ALLOW)) {
      const src = readFileSync(join(ROOT, r), "utf8");
      expect(usesServiceRole(src), r).toBe(true);
    }
  });

  test("the guard runs before the service-role client is touched", () => {
    const late: string[] = [];
    for (const file of routeFiles) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!src.includes("requirePermission(")) continue;
      for (const h of handlers(src)) {
        const g = h.body.search(/\brequirePermission\(/);
        const a = h.body.search(/\bgetSupabaseAdmin\(/);
        if (g >= 0 && a >= 0 && a < g) late.push(`${rel(file)} ${h.method}`);
      }
    }
    expect(late).toEqual([]);
  });
});

describe("role guard coverage: app/admin service-role reads", () => {
  test("every app/admin file importing the service-role client calls the page guard", () => {
    const missing: string[] = [];
    let guarded = 0;
    for (const file of adminFiles) {
      const r = rel(file);
      const src = stripComments(readFileSync(file, "utf8"));
      if (!/from "@\/lib\/supabase\/admin"/.test(src) || PAGE_ALLOW[r]) continue;
      if (PAGE_GUARD.test(src)) guarded++;
      else missing.push(r);
    }
    expect(missing, "add requirePagePermission(<module read perm>, label) at the top").toEqual([]);
    expect(guarded).toBeGreaterThan(40);
  });

  test("the page guard is the FIRST thing a guarded default export does", () => {
    const late: string[] = [];
    for (const file of adminFiles) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!src.includes("requirePagePermission(")) continue;
      const k = src.indexOf("export default async function");
      if (k < 0) continue;
      const body = src.slice(k);
      const g = body.search(/\brequirePagePermission\(/);
      const a = body.search(/\bgetSupabaseAdmin\(/);
      if (a >= 0 && a < g) late.push(rel(file));
    }
    expect(late).toEqual([]);
  });
});

describe("Today never shows money without finance.read", () => {
  test("the Money tile is gated on the finance.read permission, not only the module", () => {
    const src = readFileSync(join(ROOT, "app/admin/today/page.tsx"), "utf8");
    expect(src).toMatch(/showFinance\s*=\s*hasFeature\(ents, "modules\.finance"\)\s*&&\s*\(await ctxHasPermission\(ctx, "finance\.read"\)\)/);
    expect(src).toMatch(/showFinance \? await getFinanceSnapshot\(\) : null/);
  });

  test("Organization Health gates its service-role rows on the role", () => {
    const src = readFileSync(join(ROOT, "lib/admin/orgHealth.ts"), "utf8");
    expect(src).toMatch(/modules\.finance"\) && \(await can\("finance\.read"\)\)/);
    expect(src).toMatch(/modules\.program"\) && \(await can\("program\.read"\)\)/);
  });
});

describe("entitlements are operator-granted only", () => {
  // Finding 14: an org admin must not enable paid or aa.* entitlements on
  // their own org. No app route writes org_entitlements (grants are operator
  // SQL on the service role); keep it that way. The remaining hole is the
  // "managers write org_entitlements" RLS policy (org.manage), which lets an
  // admin write through PostgREST directly — closing it needs a migration.
  test("no app or lib code inserts, updates, upserts or deletes org_entitlements", () => {
    const offenders: string[] = [];
    for (const file of [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))]) {
      const src = stripComments(readFileSync(file, "utf8"));
      const re = /from\(\s*["']org_entitlements["']\s*\)([\s\S]{0,200})/g;
      for (const m of Array.from(src.matchAll(re))) {
        if (/^\s*\.\s*(insert|update|upsert|delete)\s*\(/.test(m[1])) offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
