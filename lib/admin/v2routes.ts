/**
 * BloomOS V2 — the redirect map (Spec B, stage B2).
 *
 * THE single source of truth for V1 → V2 route moves: every row of the
 * recon's corrected Stage-0 delta table (docs/v2-recon.md §F.1) lives here
 * with an explicit activation state. Three consumers:
 *
 *   1. next.config.mjs — serves the ACTIVE rows as permanent (308) server
 *      redirects. Server-side is mandatory: notifications.url rows store
 *      relative /admin/... paths forever, and operator emails already in
 *      inboxes carry V1 paths (recon §F.2). tests/redirects-v2.test.ts
 *      asserts config and map agree — edit BOTH when activating a row.
 *   2. lib/admin/actionQueue.ts — the source→route fallback table pipes its
 *      hrefs through v2Href(), so every queue/Today deep link moves the
 *      moment a row activates, with no per-destination-spec edits.
 *   3. lib/admin/entities.ts — the entity-URL resolver translates built URLs
 *      through v2Href(), moving ops_tasks.linked_entity_* and
 *      notifications.linked_entity_* links the same way.
 *
 * Activation states:
 *   "now"        — 1:1 moves (renamed / re-homed / kept-with-new-path). The
 *                  V2 path exists as a HOST page rendering the V1 page
 *                  behind the same FeatureGate the V1 section layout uses,
 *                  so nothing is lost and nothing 404s. Redirect live.
 *   "at-cutover" — merges (several V1 screens fold into one V2 seat) and
 *                  settings moves. Redirecting these before their
 *                  destination spec builds the merged seat would DESTROY a
 *                  working screen (e.g. /admin/ops/friday's close ritual has
 *                  nowhere to live inside a Tasks host). They activate in
 *                  the destination spec that builds their seat; the entry
 *                  here is the contract that they will, and the redirect is
 *                  then permanent.
 *   "no-home"    — the design bundle gives the route no V2 seat (recon
 *                  §F.1 "NO V2 HOME"). The V1 route stays live and unlinked
 *                  until Remi rules on a seat. Never silently dropped.
 *
 * Unentitled behavior (Spec B open decision 3, RESOLVED): every active
 * target is a deep-linkable surface — they are exactly the routes
 * notifications, queue links, and entity URLs point at — so an unentitled
 * hit renders the permission-limited screen (FeatureGate's not-authorized
 * panel), never a 404 and never a silent bounce. The redirect-to-Home
 * bucket is for non-linkable chrome (a destination landing whose tab list
 * resolves empty), which arrives with B3's shell — no B2 route is in it.
 *
 * Query strings survive every hop (Next redirect semantics, the /ms
 * precedent); no destination carries its own query, so nothing is dropped.
 */

export type V2RouteRow = {
  /** V1 path. With kind "prefix", every subpath moves too. */
  v1: string;
  /** Canonical V2 path (null for no-home rows). */
  v2: string | null;
  kind: "exact" | "prefix" | "uuid-child";
  activation: "now" | "at-cutover" | "no-home";
  /** F.1 disposition, for the record. */
  disposition: string;
  note?: string;
};

// ── ACTIVE NOW: 1:1 moves with live hosts ───────────────────────────────────
// "uuid-child" rows move /v1/<uuid> → /v2/<uuid> and deliberately do NOT
// match named children (so /admin/staff/reviews and /admin/meetings/
// connections stay put without a fragile exclusion list).
const ACTIVE: V2RouteRow[] = [
  { v1: "/admin/strategic-plan", v2: "/admin/organization/strategy", kind: "exact", activation: "now", disposition: "re-homed" },
  { v1: "/admin/ops", v2: "/admin/work/tasks", kind: "exact", activation: "now", disposition: "re-homed" },
  { v1: "/admin/ops/my-week", v2: "/admin/work/my-week", kind: "exact", activation: "now", disposition: "kept" },
  { v1: "/admin/ops/projects", v2: "/admin/work/projects", kind: "prefix", activation: "now", disposition: "kept" },
  { v1: "/admin/meetings", v2: "/admin/work/meetings", kind: "exact", activation: "now", disposition: "re-homed" },
  { v1: "/admin/meetings", v2: "/admin/work/meetings", kind: "uuid-child", activation: "now", disposition: "re-homed" },
  { v1: "/admin/meetings/upcoming", v2: "/admin/work/meetings/upcoming", kind: "prefix", activation: "now", disposition: "re-homed" },
  { v1: "/admin/staff", v2: "/admin/organization/team", kind: "exact", activation: "now", disposition: "re-homed" },
  { v1: "/admin/staff", v2: "/admin/organization/team", kind: "uuid-child", activation: "now", disposition: "re-homed" },
  { v1: "/admin/documents", v2: "/admin/work/documents", kind: "prefix", activation: "now", disposition: "re-homed" },
  { v1: "/admin/finance", v2: "/admin/finance/snapshot", kind: "exact", activation: "now", disposition: "renamed" },
  { v1: "/admin/finance/report", v2: "/admin/finance/reports", kind: "exact", activation: "now", disposition: "merged", note: "1:1 today; Reports absorbs more at the Finance cutover" },
  { v1: "/admin/analytics", v2: "/admin/impact/analytics", kind: "exact", activation: "now", disposition: "re-homed" },
  { v1: "/admin/kpis", v2: "/admin/impact/kpis", kind: "exact", activation: "now", disposition: "re-homed" },
  { v1: "/admin/students", v2: "/admin/programs/people", kind: "prefix", activation: "now", disposition: "re-homed" },
  { v1: "/admin/intake", v2: "/admin/programs/intake", kind: "exact", activation: "now", disposition: "kept" },
  { v1: "/admin/cohorts", v2: "/admin/programs/cohorts", kind: "prefix", activation: "now", disposition: "re-homed" },
  { v1: "/admin/program", v2: "/admin/programs/overview", kind: "exact", activation: "now", disposition: "re-homed" },
  { v1: "/admin/partners", v2: "/admin/programs/partners", kind: "prefix", activation: "now", disposition: "re-homed" },
  { v1: "/admin/careers", v2: "/admin/programs/content", kind: "exact", activation: "now", disposition: "re-homed", note: "daily/pool stay at V1 paths (no-home rows)" },
  { v1: "/admin/board", v2: "/admin/organization/board", kind: "prefix", activation: "now", disposition: "re-homed" },
  { v1: "/admin/compliance", v2: "/admin/organization/compliance", kind: "prefix", activation: "now", disposition: "re-homed" },
  // ── Home cutover (Spec Home, H3) — the first at-cutover activations ──────
  // exact on purpose: /admin/briefing/weekly is NO_HOME and stays put.
  { v1: "/admin/queue", v2: "/admin/today", kind: "exact", activation: "now", disposition: "merged", note: "View-all resolved as expand-in-place on Today (Spec Home decision 1)" },
  { v1: "/admin/briefing", v2: "/admin/today", kind: "exact", activation: "now", disposition: "merged", note: "the briefing engine feeds Today's orientation line" },
  // ── Fundraising cutover (Spec Fundraising, F6). Three rows narrowed from
  // the Stage 0 prefix shape so no child 308s into a 404 (the uuid-child
  // mechanism exists for exactly this): plan and acknowledgments go EXACT
  // (plan/[id] and acknowledgments/{letters,templates} stay live until
  // Campaigns absorbs the plan detail and Settings seats the templates), and
  // prospects splits exact + uuid-child (import and by-hubspot/* stay live —
  // the R1 drawer links them). asks stays a true prefix: its only child is
  // [id], seated at /admin/fundraising/pipeline/[id]. ──
  { v1: "/admin/fundraising", v2: "/admin/fundraising/today", kind: "exact", activation: "now", disposition: "merged" },
  { v1: "/admin/fundraising/plan", v2: "/admin/fundraising/campaigns", kind: "exact", activation: "now", disposition: "merged", note: "narrowed from prefix at F6: plan/[id] stays live" },
  { v1: "/admin/fundraising/donors", v2: "/admin/fundraising/donors-funders", kind: "prefix", activation: "now", disposition: "merged" },
  { v1: "/admin/fundraising/prospects", v2: "/admin/fundraising/donors-funders", kind: "exact", activation: "now", disposition: "merged", note: "Prospects view + R1 drawer" },
  { v1: "/admin/fundraising/prospects", v2: "/admin/fundraising/donors-funders", kind: "uuid-child", activation: "now", disposition: "merged", note: "lands on the Donor 360's prospect variant (both id spaces)" },
  { v1: "/admin/fundraising/asks", v2: "/admin/fundraising/pipeline", kind: "prefix", activation: "now", disposition: "merged" },
  { v1: "/admin/fundraising/acknowledgments", v2: "/admin/fundraising/today", kind: "exact", activation: "now", disposition: "merged", note: "narrowed from prefix at F6: letters/templates stay live pending their Settings seat" },
  { v1: "/admin/fundraising/recurring", v2: "/admin/fundraising/donors-funders", kind: "exact", activation: "now", disposition: "merged", note: "the Recurring view" },
  { v1: "/admin/fundraising/journeys", v2: "/admin/fundraising/donors-funders", kind: "exact", activation: "now", disposition: "merged", note: "journey surface seat stays reserved and empty (signed ruling)" },
  // ── Finance cutover (Spec Finance, N4). The two same-path rows
  // (transactions, forecast) are ACTIVE fixed points: their pages absorbed
  // their tributaries at N1/N2, so v1 IS v2 — activeRedirects() skips them
  // (a config row redirecting a path to itself would loop). pledges is
  // EXACT per the spec's as-built ruling: pledges/[id] keeps its live
  // screen until Donor 360 absorbs pledge history. ──
  { v1: "/admin/finance/transactions", v2: "/admin/finance/transactions", kind: "exact", activation: "now", disposition: "merged", note: "same path; absorbed /reconcile and /close at N1 — never a config redirect" },
  { v1: "/admin/finance/reconcile", v2: "/admin/finance/transactions", kind: "exact", activation: "now", disposition: "merged" },
  { v1: "/admin/finance/close", v2: "/admin/finance/transactions", kind: "exact", activation: "now", disposition: "merged", note: "gated close (Contract 7, N1)" },
  { v1: "/admin/finance/forecast", v2: "/admin/finance/forecast", kind: "exact", activation: "now", disposition: "merged", note: "same path; absorbed /model, /revenue and the pledges tier at N2 — never a config redirect" },
  { v1: "/admin/finance/model", v2: "/admin/finance/forecast", kind: "exact", activation: "now", disposition: "merged", note: "aa.finance_model fenced since N2" },
  { v1: "/admin/finance/revenue", v2: "/admin/finance/forecast", kind: "exact", activation: "now", disposition: "merged", note: "commitments tier" },
  { v1: "/admin/fundraising/pledges", v2: "/admin/finance/forecast", kind: "exact", activation: "now", disposition: "merged", note: "narrowed from prefix at N4: pledges/[id] stays live" },
  // ── Work cutover (Spec Work, W4). The two ritual routes merge onto Plan &
  // Close (both flows live there since W1); Calendar folds into My Week (W2,
  // Handoff Spec); connections graduates settings → merged per decision 3
  // (the R2 addendum binds connection_candidates to Work → Meetings — the
  // queue is workflow, not settings) and goes EXACT: it has no children, and
  // booking-page stays a true settings row. ──
  { v1: "/admin/ops/monday", v2: "/admin/work/plan-close", kind: "exact", activation: "now", disposition: "merged", note: "Plan & Close hosts both rituals since W1" },
  { v1: "/admin/ops/friday", v2: "/admin/work/plan-close", kind: "exact", activation: "now", disposition: "merged", note: "?ritual=close deep-links the Friday flow" },
  { v1: "/admin/calendar", v2: "/admin/work/my-week", kind: "exact", activation: "now", disposition: "kept", note: "Handoff Spec folds Calendar into My Week (W2); ?week=/?owner= ride the 308" },
  { v1: "/admin/meetings/connections", v2: "/admin/work/meetings", kind: "exact", activation: "now", disposition: "merged", note: "settings → merged at W4 (decision 3, R2 addendum); Meetings embeds the pipeline since W3" },
  // ── Programs cutover (Spec Programs, P4). One move: volunteers RE-AIMED
  // per decision 1 — Stage 0 said Programs → People, but volunteers are
  // constituents (is_volunteer) and People runs on students, so the honest
  // seat is the one-list's volunteers view (P3). First destination carrying
  // a canonical query; v2Href merges a source query with "&". ──
  { v1: "/admin/fundraising/volunteers", v2: "/admin/fundraising/donors-funders?view=volunteers", kind: "exact", activation: "now", disposition: "merged", note: "re-aimed at P4 (decision 1): the volunteers view of the one list, not People" },
  // ── Impact cutover (Spec Impact, I4). One move: the KPI scorecard onto
  // KPIs, which embeds the owner cards since I3 (decision 3: a working
  // surface is absorbed, not parked). Exact on purpose: the other
  // strategic-plan children are Organization's rows (objective/review/setup
  // at-cutover; narrative/people NO_HOME) and stay put. ──
  { v1: "/admin/strategic-plan/scorecard", v2: "/admin/impact/kpis", kind: "exact", activation: "now", disposition: "merged", note: "KPIs embeds the owner cards since I3; editing travels" },
  // ── Organization cutover (Spec Org, O2). Strategy's children move to the
  // seats O1 built (child hosts, decision 1): the objective detail rides the
  // prefix, the monthly review goes exact. setup stays settings-null;
  // narrative/people/staff-reviews stay NO_HOME, reachable via the plan
  // page's own menu. ──
  { v1: "/admin/strategic-plan/objective", v2: "/admin/organization/strategy/objective", kind: "prefix", activation: "now", disposition: "re-homed", note: "re-targeted at O1: the Stage 0 target (the bare landing) would have 404'd the children" },
  { v1: "/admin/strategic-plan/review", v2: "/admin/organization/strategy/review", kind: "exact", activation: "now", disposition: "re-homed", note: "the monthly review keeps its screen at its Strategy seat (O1 host)" },
  // ── Inbox cutover (Spec Inbox, X2) — the LAST activation of the rebuild.
  // The map's oldest contract discharged: the two notifications.url shapes
  // stored in production (/admin/messages, /admin/messages?t=<uuid>) now
  // translate to the X1 seat, ?t= riding the 308. ──
  { v1: "/admin/messages", v2: "/admin/inbox/messages", kind: "exact", activation: "now", disposition: "merged", note: "the last merge seat, built at X1; the stored ?t= shapes land in-thread" },
];

// ── AT CUTOVER: merges and settings moves, activated by destination specs ───
const AT_CUTOVER: V2RouteRow[] = [
  { v1: "/admin", v2: "/admin/today", kind: "exact", activation: "at-cutover", disposition: "re-homed (recomposed)", note: "ACTIVATED at H3 as an in-page auth-aware forward (app/admin/page.tsx): /admin hosts the signed-out login UI and a config 308 can't branch on auth. Never becomes a config redirect; this row stays for canonicalSeat/highlighting." },
  // messages graduated to ACTIVE at Spec Inbox X2 — no at-cutover merges remain.
  // objective and review graduated (re-targeted at O1) to ACTIVE at Spec Org O2.
  // scorecard graduated to ACTIVE at Spec Impact I4.
  { v1: "/admin/strategic-plan/setup", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings" },
  // Work's four moves (monday, friday, calendar, connections) graduated to
  // ACTIVE at Spec Work W4; booking-page stays the one true settings row.
  { v1: "/admin/meetings/booking-page", v2: null, kind: "prefix", activation: "at-cutover", disposition: "settings" },
  // Fundraising's eight moves graduated at F6; pledges graduated at Spec
  // Finance N4 once Forecast absorbed its tier.
  { v1: "/admin/fundraising/duplicates", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings" },
  { v1: "/admin/fundraising/import", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings" },
  { v1: "/admin/fundraising/settings", v2: null, kind: "prefix", activation: "at-cutover", disposition: "settings" },
  // Finance's six same-path/merge rows graduated to ACTIVE at Spec Finance N4.
  { v1: "/admin/finance/rules", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings" },
  { v1: "/admin/finance/config", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings" },
  { v1: "/admin/finance/upload", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings" },
  { v1: "/admin/finance/budget/import", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings" },
  { v1: "/admin/imports", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings" },
  // volunteers graduated (re-aimed) to ACTIVE at Spec Programs P4.
  { v1: "/admin/demoday", v2: "/admin/programs/cohorts", kind: "exact", activation: "at-cutover", disposition: "merged", note: "pinned Group view (signed ruling R8) — mechanism undesigned, revisit October; deliberately NOT moved at the P4 cutover" },
  { v1: "/admin/reed", v2: null, kind: "exact", activation: "at-cutover", disposition: "merged (utility)", note: "becomes the contextual panel" },
  { v1: "/admin/howto", v2: null, kind: "exact", activation: "at-cutover", disposition: "settings", note: "Help" },
];

// ── NO V2 HOME: live, unlinked, awaiting a ruling ───────────────────────────
const NO_HOME: V2RouteRow[] = [
  { v1: "/admin/strategic-plan/narrative", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME", note: "builder; nearest: Strategy detail" },
  { v1: "/admin/strategic-plan/people", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME" },
  { v1: "/admin/briefing/weekly", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME", note: "nearest: Work → Plan & Close Friday" },
  { v1: "/admin/meet", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME", note: "public-scheduler admin; nearest: Settings" },
  { v1: "/admin/staff/reviews", v2: null, kind: "prefix", activation: "no-home", disposition: "NO V2 HOME", note: "modules.reviews" },
  { v1: "/admin/fundraising/comms", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME", note: "modules.comms" },
  { v1: "/admin/fundraising/reports", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME", note: "nearest: Impact → Reports or Finance → Reports" },
  { v1: "/admin/fundraising/strategy", v2: null, kind: "prefix", activation: "no-home", disposition: "NO V2 HOME", note: "funder-angle briefs" },
  { v1: "/admin/careers/daily", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME", note: "proposal: Programs → Content section" },
  { v1: "/admin/careers/pool", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME", note: "proposal: Programs → Content section" },
  { v1: "/admin/legacy", v2: null, kind: "exact", activation: "no-home", disposition: "NO V2 HOME", note: "keep route unlinked" },
];

/** The whole F.1 delta, one list. Kept-in-place rows (/admin/inbox,
 *  /admin/settings, /admin/fundraising/today, /admin/fundraising/grants,
 *  /admin/fundraising/campaigns, /admin/finance/budget, /admin/reset-password)
 *  need no row: V1 path IS the V2 path. */
export const V2_ROUTE_MAP: V2RouteRow[] = [...ACTIVE, ...AT_CUTOVER, ...NO_HOME];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Translate one app-relative URL through the ACTIVE rows. At-cutover and
 * no-home rows return the input unchanged — their V1 screens are still the
 * real seats. Longest-match wins; query strings ride along untouched.
 */
export function v2Href(v1Url: string): string {
  const qIndex = v1Url.indexOf("?");
  const path = qIndex === -1 ? v1Url : v1Url.slice(0, qIndex);
  const query = qIndex === -1 ? "" : v1Url.slice(qIndex);

  let best: { row: V2RouteRow; suffix: string } | null = null;
  for (const row of ACTIVE) {
    if (row.kind === "exact") {
      if (path === row.v1 && (!best || row.v1.length >= best.row.v1.length)) {
        best = { row, suffix: "" };
      }
    } else if (row.kind === "prefix") {
      if (
        (path === row.v1 || path.startsWith(row.v1 + "/")) &&
        (!best || row.v1.length >= best.row.v1.length)
      ) {
        best = { row, suffix: path.slice(row.v1.length) };
      }
    } else {
      // uuid-child: /v1/<uuid> only — named children stay put.
      if (path.startsWith(row.v1 + "/")) {
        const child = path.slice(row.v1.length + 1);
        if (UUID_RE.test(child) && (!best || row.v1.length >= best.row.v1.length)) {
          best = { row, suffix: "/" + child };
        }
      }
    }
  }
  if (!best || !best.row.v2) return v1Url;
  const dest = best.row.v2 + best.suffix;
  if (!query) return dest;
  // A destination may carry a canonical query of its own (first case: the
  // P4 volunteers row lands on Donors & Funders ?view=volunteers). The
  // source's query still rides along — appended, never a second "?".
  return dest + (dest.includes("?") ? "&" + query.slice(1) : query);
}

// ── B3: the shell's live-seat resolution ────────────────────────────────────
// The V2 nav model's tab hrefs are CANONICAL routes; several have no screen
// until their destination spec builds it. The shell must never link a dead
// path, so each tab resolves to its LIVE seat:
//   - an ACTIVE row's v2 target exists as a host page → the canonical path;
//   - a kept-in-place path (V1 path IS the V2 path) → itself;
//   - an at-cutover merge → the FIRST v1 source in map order (the live V1
//     screen that will 308 here when the seat is built);
//   - anything else has no seat yet → null, and the shell hides the tab
//     until its destination spec ships (tests/v2-shell.test.ts pins the
//     exact seatless set so it can only shrink).

/** V1 paths that are already their own V2 seat (the map's kept-in-place
 *  comment, as data). /admin/reset-password is chrome-less and never a tab. */
export const KEPT_IN_PLACE: readonly string[] = [
  "/admin/inbox",
  "/admin/settings",
  "/admin/fundraising/today",
  "/admin/fundraising/grants",
  "/admin/fundraising/campaigns",
  "/admin/finance/budget",
  // V2-only screens (no V1 source): their own path IS the seat (Spec Home H3).
  "/admin/organization-health",
  "/admin/programs/attendance", // Spec Programs P1: the cross-cohort session surface
  "/admin/impact/outcomes",     // Spec Impact I1: the provenance-first outcomes surface
  "/admin/impact/reports",      // Spec Impact I2: the gated report builder (Contract 7's third exit)
];

/** The live screen for a canonical V2 path today, or null when none exists
 *  yet (pre-cutover, the tab is hidden rather than linked dead). */
export function liveSeatFor(v2Path: string): string | null {
  if (ACTIVE.some((r) => r.v2 === v2Path)) return v2Path;
  if (KEPT_IN_PLACE.includes(v2Path)) return v2Path;
  const rows = AT_CUTOVER.filter((r) => r.v2 === v2Path);
  // A same-path row (v1 IS the future seat, e.g. /admin/finance/forecast
  // absorbing /model at cutover) beats other sources merging into it.
  if (rows.some((r) => r.v1 === v2Path)) return v2Path;
  if (rows.length > 0) return rows[0].v1;
  return null;
}

/**
 * A live path's canonical V2 seat, for active-destination matching in the
 * shell: ACTIVE rows translate like v2Href; at-cutover rows translate to the
 * seat their v1 will eventually 308 to; everything else is itself. This is
 * a HIGHLIGHTING read only — never used to build a link (at-cutover seats
 * don't exist yet).
 */
export function canonicalSeat(path: string): string {
  const active = v2Href(path);
  if (active !== path) return active.split("?")[0];
  let best: V2RouteRow | null = null;
  for (const row of AT_CUTOVER) {
    if (!row.v2) continue;
    const hit =
      row.kind === "exact"
        ? path === row.v1
        : path === row.v1 || path.startsWith(row.v1 + "/");
    if (hit && (!best || row.v1.length > best.v1.length)) best = row;
  }
  return best?.v2 ?? path;
}

/**
 * The active rows as next.config-shaped redirect entries. next.config.mjs
 * cannot import TS, so it carries its own copy of this list;
 * tests/redirects-v2.test.ts asserts the two agree row-for-row.
 */
export function activeRedirects(): { source: string; destination: string }[] {
  return ACTIVE
    // Same-path rows (v1 IS v2 — Finance's transactions/forecast since N4)
    // are ACTIVE fixed points, not redirects: a config row sending a path to
    // itself would loop forever. They stay in the map for liveSeatFor and
    // the fixed-point tests; the config never sees them.
    .filter((row) => row.v1 !== row.v2)
    .map((row) => {
      if (row.kind === "exact") return { source: row.v1, destination: row.v2! };
      if (row.kind === "prefix")
        return { source: `${row.v1}/:path*`, destination: `${row.v2}/:path*` };
      // uuid-child: match one uuid-shaped segment only.
      return {
        source: `${row.v1}/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})`,
        destination: `${row.v2}/:id`,
      };
    });
}
