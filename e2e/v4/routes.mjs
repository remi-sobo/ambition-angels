// Route inventory for the V4 audit captures, derived from the code at run time
// so it tracks the repo: lib/admin/nav.ts (destinations + tabs),
// lib/admin/v2routes.ts (redirect map + kept-in-place seats) and every
// page.tsx/page.jsx under app/admin.
//
//   import { buildRoutes } from "./routes.mjs";
//   const { nav, orphans, details, extras, all, inventory } = buildRoutes();

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixtures } from "./fixtures/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function navFromCode() {
  const src = read("lib/admin/nav.ts");
  const out = [];
  // destination blocks: key: "x", label: "X", ... tabs: [ ... ]
  const destRe = /\{\s*key: "([a-z-]+)",\s*label: "([^"]+)",\s*icon: "[a-z]+",[\s\S]*?tabs: \[([\s\S]*?)\n\s*\],/g;
  let m;
  while ((m = destRe.exec(src))) {
    const [, dest, destLabel, body] = m;
    const tabRe = /\{ key: "([a-z-]+)", label: "([^"]+)", href: "([^"]+)"(?:, feature: "([^"]+)")?/g;
    let t;
    while ((t = tabRe.exec(body))) out.push({ group: "nav", dest, destLabel, tab: t[1], label: `${destLabel} / ${t[2]}`, path: t[3], feature: t[4] || null });
  }
  return out;
}

function redirectMap() {
  const src = read("lib/admin/v2routes.ts");
  const active = src.slice(src.indexOf("const ACTIVE"), src.indexOf("const AT_CUTOVER"));
  const rows = [];
  const re = /\{ v1: "([^"]+)", v2: (?:"([^"]+)"|null), kind: "([a-z-]+)"/g;
  let m;
  while ((m = re.exec(active))) if (m[1] !== m[2]) rows.push({ v1: m[1], v2: m[2], kind: m[3] });
  return rows;
}

function pageFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^page\.(tsx|jsx)$/.test(e.name)) out.push(p);
    }
  };
  walk("app/admin");
  return out.sort();
}

const UUIDISH = /^\[(id|cycleId|sessionId|eventId|hubspot_id|key)\]$/;

export function buildRoutes() {
  const fx = buildFixtures({ profile: "populated" }).tables;
  const first = (t, pred = () => true) => (fx[t] || []).find(pred);
  const ids = {
    constituent: first("constituents", (c) => c.type === "person")?.id,
    funder: first("constituents", (c) => c.type === "organization")?.id,
    company: first("constituents", (c) => (c.tags || []).includes("company"))?.id,
    student: first("students")?.id,
    cohort: first("cohorts", (c) => c.status === "active")?.id,
    partner: first("partners")?.id,
    board: first("board_meetings")?.id,
    boardMember: first("board_members")?.id,
    compliance: first("compliance_items")?.id,
    grant: first("grants", (g) => g.stage === "awarded")?.id || first("grants")?.id,
    objective: first("plan_objectives")?.id,
    meeting: first("meeting_records")?.id,
    project: first("ops_projects")?.id,
    staff: first("staff")?.id,
    opp: first("opportunities")?.id,
    pledge: first("pledges")?.id,
    campaign: first("campaigns")?.id,
    comms: first("email_campaigns", (c) => c.status === "sent")?.id,
    commsDraft: first("email_campaigns", (c) => c.status === "draft")?.id,
    event: first("calendar_events", (e) => /^Donor/.test(e.title || "") && new Date(e.start_time) > new Date())?.id || first("calendar_events")?.id,
    ask: first("asks")?.id,
    reviewCycle: first("review_cycles")?.id,
  };
  const session = first("cohort_sessions", (s) => s.cohort_id === ids.cohort && s.status === "held")?.id;

  const nav = navFromCode();
  const navPaths = new Set(nav.map((n) => n.path));
  const redirects = redirectMap();
  const isRedirected = (p) =>
    redirects.some((r) =>
      r.kind === "exact" ? p === r.v1 : r.kind === "prefix" ? p === r.v1 || p.startsWith(r.v1 + "/") : p.startsWith(r.v1 + "/[")
    );

  const inventory = [];
  const orphans = [];
  for (const f of pageFiles()) {
    const rel = f.replace(/^app/, "").replace(/\/page\.(tsx|jsx)$/, "") || "/admin";
    const src = read(f);
    const pureRedirect = src.length < 1500 && /\b(redirect|permanentRedirect)\(/.test(src) && !/return\s*\(?\s*</.test(src);
    const dynamic = rel.split("/").some((s) => s.startsWith("["));
    const configRedirect = isRedirected(rel);
    const kind = rel.includes("[...not_found]") ? "catch-all" : configRedirect ? "config-redirect (308)" : pureRedirect ? "page-redirect" : dynamic ? "detail" : navPaths.has(rel) ? "nav" : rel === "/admin" ? "login/home" : "orphan";
    inventory.push({ file: f, route: rel, kind });
    if (kind === "orphan") orphans.push({ group: "orphan", label: rel.replace("/admin/", ""), path: rel });
  }

  const D = (label, p) => ({ group: "detail", label, path: p });
  const details = [
    D("Donor 360 (person)", `/admin/fundraising/donors-funders/${ids.constituent}`),
    D("Funder 360 (foundation)", `/admin/fundraising/donors-funders/${ids.funder}`),
    D("Companies view", `/admin/fundraising/donors-funders/companies`),
    D("Pipeline (ask) detail", `/admin/fundraising/pipeline/${ids.ask}`),
    D("Grant detail", `/admin/fundraising/grants/${ids.grant}`),
    D("Campaign plan detail", `/admin/fundraising/plan/${ids.campaign}`),
    D("Pledge detail", `/admin/fundraising/pledges/${ids.pledge}`),
    D("Comms campaign (sent)", `/admin/fundraising/comms/${ids.comms}`),
    D("Comms campaign (draft)", `/admin/fundraising/comms/${ids.commsDraft}`),
    D("Student detail", `/admin/programs/people/${ids.student}`),
    D("Cohort detail", `/admin/programs/cohorts/${ids.cohort}`),
    D("Cohort session", `/admin/programs/cohorts/${ids.cohort}/sessions/${session}`),
    D("Partner detail", `/admin/programs/partners/${ids.partner}`),
    D("Project detail", `/admin/work/projects/${ids.project}`),
    D("Meeting detail", `/admin/work/meetings/${ids.meeting}`),
    D("Upcoming meeting prep", `/admin/work/meetings/upcoming/${ids.event}`),
    D("Board member detail", `/admin/organization/board/${ids.boardMember}`),
    D("Compliance item detail", `/admin/organization/compliance/${ids.compliance}`),
    D("Strategy objective detail", `/admin/organization/strategy/objective/${ids.objective}`),
    D("Team member detail", `/admin/organization/team/${ids.staff}`),
    D("Staff review cycle", `/admin/staff/reviews/${ids.reviewCycle}`),
    D("Task deep link (?task=)", `/admin/work/tasks?task=${fx.ops_tasks?.[25]?.id}`),
    D("Donors volunteers view", `/admin/fundraising/donors-funders?view=volunteers`),
    D("Plan & Close (Friday)", `/admin/work/plan-close?ritual=close`),
  ];
  const extras = [
    { group: "auth", label: "Login screen (signed out)", path: "/admin", signedOut: true },
    { group: "auth", label: "404 inside shell", path: "/admin/this-page-does-not-exist" },
    { group: "auth", label: "Settings", path: "/admin/settings" },
  ];
  const all = [...nav, ...orphans.filter((o) => o.path !== "/admin/settings"), ...details, ...extras];
  return { nav, orphans, details, extras, all, inventory, ids };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = buildRoutes();
  console.log(JSON.stringify({ counts: { nav: r.nav.length, orphans: r.orphans.length, details: r.details.length }, orphans: r.orphans.map((o) => o.path), inventory: r.inventory.map((i) => `${i.kind}\t${i.route}`) }, null, 1));
}
