import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Tenant read-isolation guard (the tripwire the RLS leak-test can't be).
 *
 * BloomOS admin pages/routes read through the SERVICE-ROLE Supabase client
 * (`getSupabaseAdmin()`), which BYPASSES row-level security. RLS being correct
 * therefore does NOT protect these reads — every read (and every by-id
 * update/delete) of a tenant-scoped table via the service-role client MUST
 * carry an explicit `.eq("org_id", …)`, or one tenant sees/mutates another's
 * data. The cross-role RLS suite (supabase/tests/rls-leak-test.sql) exercises
 * the DB policies; it cannot see an app that goes around them. This static scan
 * closes that gap and fails CI when a new unscoped service-role read lands.
 *
 * Heuristic: in any file that obtains the service-role client, each query
 * statement that hits a tenant-scoped table and READS (`.select`) or writes by
 * id (`.update`/`.delete`) must contain `org_id` in its chain. Inserts are
 * excluded (they stamp `org_id` in the row object, verified separately).
 * Genuinely global/public-funnel tables and a few audited exceptions are
 * allow-listed below with reasons.
 */

const REPO = join(__dirname, "..");

// Tables carrying an org_id column (from information_schema, 2026-07-19) whose
// service-role reads MUST be org-scoped. See GLOBAL_ALLOW for the public-funnel
// tables deliberately excluded.
const TENANT_TABLES = new Set([
  "ack_templates", "acknowledgments", "agenda_delegations", "appeals", "applications",
  "ask_documents", "asks", "attendance", "blackouts", "bloomos_briefing_state",
  "board_meetings", "board_members",
  "bookings", "briefings", "calendar_events", "calendar_sync_jobs", "campaigns",
  "cohort_members", "cohort_sessions", "cohorts", "compliance_items", "connection_candidates",
  "coach_matches", "coach_people", "coach_sessions", "connections", "constituents", "custom_field_defs", "demoday_notes", "demoday_signups",
  "document_links", "documents", "email_campaigns", "email_sends", "email_suppressions",
  "entity_comments", "external_refs", "fin_budget", "fin_categories", "fin_category_rules",
  "fin_config", "fin_imports", "fin_reconciliation_items", "fin_revenue_commitments",
  "fin_transactions", "fr_agent_activity_log", "fr_email_drafts", "fr_funding_opportunities",
  "fr_gift_table_credits", "fr_gift_table_levels", "fr_gift_table_placements", "fr_gift_tables",
  "fr_nba_suggestions", "fr_plan_gift_levels", "fr_plan_strategies",
  "fr_prospect_briefs", "fr_prospect_disqualified", "fr_prospect_promoted",
  "fr_prospect_scores", "fr_prospects", "fr_touches", "funder_angles", "funds", "gifts",
  "gmail_sync_jobs", "grant_contacts", "grant_payments", "grant_requirements", "grants", "households",
  "hs_companies", "hs_contacts", "hs_deals", "hs_engagements", "hs_sync_jobs", "import_rows",
  "imports", "interactions", "invitations", "journey_enrollments", "journey_steps", "journeys",
  "meeting_exclusions", "meeting_records", "meeting_suggested_tasks", "meeting_types",
  "memberships", "message_reactions", "message_thread_members", "message_threads", "messages",
  "metric_definitions", "metric_snapshots", "notifications", "opportunities", "ops_projects",
  "ops_tasks", "org_comms_settings", "org_email_allowlist", "org_entitlements", "org_terminology",
  "participant_stages", "partner_contacts", "partner_interactions", "partners", "pipeline_stages",
  "pipelines", "plan_foundation", "plan_goals", "plan_initiatives", "plan_kpi_snapshots",
  "plan_kpis", "plan_objective_notes", "plan_objective_tasks", "plan_objectives", "plan_reviews",
  "pledge_payments", "pledges", "programs", "recurring_plans", "reed_activity_log", "reed_drafts",
  "reed_messages", "reed_next_moves", "reed_plan_proposals", "reed_suggestions", "reed_threads",
  "relationships", "research_runs", "review_competencies", "review_cycles", "review_feedback",
  "review_manager_notes", "review_summaries", "rhythm_sessions", "segments", "soft_credits",
  "staff", "staff_goals", "staff_kpi_snapshots", "staff_kpis", "stewardship_rules",
  "strategy_angles", "strategy_room_meta", "students", "user_org_state", "ygb_attendance",
  "ygb_registrations",
  // V4 Stage D: the story bank (comms_phase1..6), org-scoped like the rest.
  "stories", "story_subjects", "story_consents", "story_media",
  "comms_formats", "comms_outputs", "comms_editions", "comms_edition_slots",
]);

// Public-funnel / global-analytics tables: written by unauthenticated public
// forms or site tracking, read as global aggregates, not per-tenant working
// data. Excluded from the org-scope requirement by design — BUT the ones that
// are Ambition Angels' own data are listed in AA_ONLY_TABLES below and must be
// read only behind the AA-only guard (second describe block).
const GLOBAL_ALLOW = new Set([
  "page_views", "click_events", "quiz_submissions", "donations", "partner_waitlist",
  "bv_newsletter_subscribers", "bv_showcase_submissions", "webhook_events", "role_permissions",
  "entity_types",
]);

// Audited exceptions: `${relPath}::${table}` → reason. Each must be justified.
// Deliberately EMPTY. Two cross-tenant leaks of the "enumerate across orgs,
// act per row" shape shipped while this list held six entries for exactly
// that pattern; the pattern was replaced with per-org iteration instead. An
// exception is the mechanism by which the next leak gets in — add one only
// with a reason a reviewer would accept in an incident report.
const EXCEPTIONS = new Map<string, string>([]);

/** Recursively collect *.ts / *.tsx files under a directory. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else if (/\.tsx?$/.test(e.name)) out.push(abs);
  }
  return out;
}

function serviceRoleFiles(): string[] {
  const roots = [
    join(REPO, "app/admin"),
    join(REPO, "app/api/admin"),
    join(REPO, "app/api/cron"),
    // External surfaces: a secret or bearer token, no session, service-role
    // reads. These leave the building, so they are scanned too.
    join(REPO, "app/api/mcp"),
    join(REPO, "app/api/hub"),
    join(REPO, "app/api/ingest"),
    join(REPO, "lib/admin"),
    join(REPO, "lib/email"),
    join(REPO, "lib/notifications"),
  ];
  const files: string[] = [];
  for (const root of roots) {
    for (const abs of walk(root)) {
      // Only files that obtain the service-role client in-file can leak here.
      if (readFileSync(abs, "utf8").includes("getSupabaseAdmin")) {
        files.push(relative(REPO, abs));
      }
    }
  }
  return files.sort();
}

type Violation = { file: string; line: number; table: string; snippet: string };

/** Identifiers bound to a given client factory in this file. */
function varsBoundTo(src: string, factory: string): Set<string> {
  const vars = new Set<string>();
  const re = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${factory}\\(\\)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) vars.add(m[1]);
  return vars;
}

/** Names that ARE the service-role client, minus any name that is ALSO bound to
 *  the RLS session client elsewhere in the file (a per-function `const sb = …`
 *  collision between a service-role POST and a session-client GET). Ambiguous
 *  names are dropped to avoid false-positives on the session-client reads —
 *  the guard's scope tracking is file-global, not per-function. */
function serviceRoleVars(src: string): Set<string> {
  const admin = varsBoundTo(src, "getSupabaseAdmin");
  const session = varsBoundTo(src, "createServerSupabase");
  for (const n of Array.from(session)) admin.delete(n);
  return admin;
}

/** The receiver token immediately before a `.from(` at index `dot`. Returns
 *  "getSupabaseAdmin" for the inline `getSupabaseAdmin().from(...)` form, or the
 *  identifier for `<ident>.from(...)`. */
function receiverBefore(src: string, dot: number): string {
  let i = dot - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  if (src[i] === ")") {
    // Walk back over a balanced `getSupabaseAdmin()` call.
    const close = i;
    const openParen = src.lastIndexOf("(", close);
    let start = openParen - 1;
    while (start >= 0 && /[\w$]/.test(src[start])) start--;
    return src.slice(start + 1, openParen);
  }
  let start = i;
  while (start >= 0 && /[\w$.]/.test(src[start])) start--;
  return src.slice(start + 1, i + 1);
}

/** Extract each `.from("table")` statement (forward window to the next `;`)
 *  on the SERVICE-ROLE client and flag tenant-table reads / by-id writes
 *  lacking an org_id filter. Reads on the RLS-enforced session client are
 *  ignored (RLS scopes them). */
function scan(file: string): Violation[] {
  const src = readFileSync(join(REPO, file), "utf8");
  const adminVars = serviceRoleVars(src);
  const out: Violation[] = [];
  const re = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const table = m[1];
    if (!TENANT_TABLES.has(table) || GLOBAL_ALLOW.has(table)) continue;
    // Only flag reads on the service-role client (session client is RLS-safe).
    const recv = receiverBefore(src, m.index);
    if (recv !== "getSupabaseAdmin" && !adminVars.has(recv)) continue;
    // Statement window: from `.from(` to the next semicolon (JS statement end).
    const start = m.index;
    const semi = src.indexOf(";", start);
    const stmt = src.slice(start, semi === -1 ? start + 800 : semi);
    // Inserts/upserts stamp org_id in the row object, not via .eq (verified
    // separately). A trailing `.select("id")` on an insert is a RETURNING
    // clause, not a read — so skip any statement that inserts/upserts.
    if (/\.(insert|upsert)\(/.test(stmt)) continue;
    const isRead = /\.select\(/.test(stmt);
    const isByIdWrite = /\.(update|delete)\(/.test(stmt);
    if (!isRead && !isByIdWrite) continue;
    if (stmt.includes("org_id")) continue;
    if (EXCEPTIONS.has(`${file}::${table}`)) continue;
    const line = src.slice(0, start).split("\n").length;
    out.push({ file, line, table, snippet: stmt.replace(/\s+/g, " ").slice(0, 120) });
  }
  return out;
}

describe("tenant read-isolation (service-role org fence)", () => {
  test("every service-role read/by-id-write of a tenant table filters by org_id", () => {
    const violations = serviceRoleFiles().flatMap(scan);
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.table}  →  ${v.snippet}`)
        .join("\n");
      throw new Error(
        `Cross-tenant leak risk: ${violations.length} service-role read(s)/write(s) of a ` +
          `tenant-scoped table without an org_id filter.\n\n${report}\n\n` +
          `Add .eq("org_id", ctx.orgId) to each, or (if genuinely global) add the table ` +
          `to GLOBAL_ALLOW / EXCEPTIONS in tests/tenant-isolation.test.ts with a reason.`
      );
    }
    expect(violations).toEqual([]);
  });
});

// ── AA-only surfaces (pre-SafeSpace fence) ───────────────────────────────────
// Tables (and RPCs) that hold Ambition Angels' data with no tenant fence in
// the query: allow-listed above as "global", or tenant-less by design (the
// career library and teen games). Exempt from the org_id rule, so they get a
// stronger one: an admin file may read them ONLY behind the AA-only guard
// (lib/admin/aaOnly.ts) — an API route must call requireAaOnly(), a page must
// sit under a layout (or be a file) that renders <AaOnlyGate>.
const AA_ONLY_TABLES = new Set([
  "quiz_submissions", "partner_waitlist", "program_partners", "page_views", "click_events",
]);
// Career library + teen games: every ms_*, game_*, cut_* table is global.
const AA_ONLY_PREFIX = /^(ms|game|cut)_/;
const AA_ONLY_RPCS = new Set(["hubspot_bench_candidates", "hubspot_bench_candidates_count"]);

function adminFiles(): string[] {
  return [join(REPO, "app/admin"), join(REPO, "app/api/admin"), join(REPO, "lib/admin")]
    .flatMap(walk)
    .map((abs) => relative(REPO, abs))
    .sort();
}

/** AA-only tables/RPCs a file touches (any client: ms_/game_ have no RLS
 *  policies, and the funnel tables' org_id defaults to AA). */
function aaOnlyTouches(src: string): string[] {
  const hits = new Set<string>();
  const re = /\.(from|rpc)\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const [, kind, name] = m;
    if (kind === "from" && (AA_ONLY_TABLES.has(name) || AA_ONLY_PREFIX.test(name))) hits.add(name);
    if (kind === "rpc" && AA_ONLY_RPCS.has(name)) hits.add(`rpc:${name}`);
  }
  return Array.from(hits);
}

/** A page-side file is gated when it, or any layout.tsx between it and
 *  app/admin, renders <AaOnlyGate>. */
function pageGated(file: string): boolean {
  if (readFileSync(join(REPO, file), "utf8").includes("<AaOnlyGate")) return true;
  let dir = file.split("/").slice(0, -1);
  while (dir.length >= 2) {
    try {
      if (readFileSync(join(REPO, ...dir, "layout.tsx"), "utf8").includes("<AaOnlyGate")) return true;
    } catch {
      /* no layout at this level */
    }
    dir = dir.slice(0, -1);
  }
  return false;
}

function aaGuarded(file: string): boolean {
  if (file.startsWith("app/api/")) return readFileSync(join(REPO, file), "utf8").includes("requireAaOnly(");
  if (file.startsWith("app/admin/")) return pageGated(file);
  return false; // lib/: a shared helper must not read AA-only data at all
}

describe("AA-only data is read only behind the AA-only guard", () => {
  test("every admin file touching an AA-only table/RPC calls requireAaOnly or sits under <AaOnlyGate>", () => {
    const readers = adminFiles()
      .map((file) => ({ file, hits: aaOnlyTouches(readFileSync(join(REPO, file), "utf8")) }))
      .filter((r) => r.hits.length > 0);
    // Not vacuous: the quiz/partner feeds and the HubSpot import live here.
    // (The careers admin and website analytics moved to the Ambition Angels
    // website admin, app/site-admin, in the repo split; tests/site-admin.test.ts
    // guards those behind requireSiteAdmin.)
    expect(readers.length).toBeGreaterThan(4);

    const unguarded = readers.filter((r) => !aaGuarded(r.file));
    // A page that re-exports a gated reader from another route group
    // (e.g. the V2 /admin/programs/content host) renders it under ITS OWN
    // layouts, so it must be gated too.
    const readerModules = readers
      .filter((r) => r.file.startsWith("app/admin/"))
      .map((r) => `@/${r.file.replace(/\.tsx?$/, "")}`);
    const hosts = adminFiles()
      .filter((f) => f.startsWith("app/admin/"))
      .filter((f) => {
        const src = readFileSync(join(REPO, f), "utf8");
        return readerModules.some((mod) => src.includes(`"${mod}"`));
      })
      .filter((f) => !aaGuarded(f))
      .map((file) => ({ file, hits: ["re-exports an AA-only reader"] }));

    const bad = [...unguarded, ...hosts];
    if (bad.length > 0) {
      throw new Error(
        `AA-only data reachable without the AA-only guard:\n` +
          bad.map((b) => `  ${b.file}  →  ${b.hits.join(", ")}`).join("\n") +
          `\n\nAPI routes: call requireAaOnly(<aa.* key>) (with { write: true } for writes). ` +
          `Pages: wrap the route group's layout in <AaOnlyGate>. See lib/admin/aaOnly.ts.`,
      );
    }
    expect(bad).toEqual([]);
  });
});
