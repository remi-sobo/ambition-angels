import fs from "node:fs";
import path from "node:path";
import { fixtures, type Org } from "./helpers";

/**
 * Every pattern in lib/admin/adminRoutes.generated.ts as a URL to load, with
 * dynamic segments filled from the signed-in org's own fixture rows (so a
 * detail page is opened on a record it should show). Route handlers that are
 * not pages (the PWA manifest) are left out.
 */
export function adminPatterns(): string[] {
  const src = fs.readFileSync(path.resolve(__dirname, "../../../lib/admin/adminRoutes.generated.ts"), "utf8");
  return [...src.matchAll(/"(\/admin[^"]*)"/g)].map((m) => m[1]).filter((p) => !/manifest\.webmanifest$/.test(p));
}

export function resolveRoutes(org: Org) {
  const fx = fixtures(org);
  const mine = (t: string, pred: (r: Record<string, any>) => boolean = () => true) =>
    (fx.tables[t] || []).find((r) => (!("org_id" in r) || r.org_id === fx.orgId) && pred(r));
  const cohort = mine("cohorts", (c) => c.status === "active");
  const id: Record<string, string | undefined> = {
    board: mine("board_members")?.id,
    capture: mine("captures")?.id,
    cohort: cohort?.id,
    session: mine("cohort_sessions", (s) => s.cohort_id === cohort?.id)?.id,
    edition: mine("comms_editions")?.id,
    email: mine("email_campaigns", (c) => c.status === "sent")?.id,
    story: mine("stories")?.id,
    compliance: mine("compliance_items")?.id,
    ask: mine("asks")?.id,
    giftTable: mine("fr_gift_tables")?.id ?? mine("gift_range_tables")?.id,
    constituent: mine("constituents", (c) => c.type === "person")?.id,
    grant: mine("grants")?.id,
    opp: mine("opportunities")?.id,
    strategy: mine("fr_plan_strategies")?.id,
    pledge: mine("pledges")?.id,
    prospect: mine("fr_prospects")?.id,
    hubspot: mine("fr_prospects", (p) => !!p.hubspot_id)?.hubspot_id ?? "0",
    angle: mine("strategy_angles")?.key ?? mine("strategy_angles")?.id,
    meeting: mine("meeting_records")?.id,
    event: mine("calendar_events")?.id,
    project: mine("ops_projects")?.id,
    objective: mine("plan_objectives")?.id,
    staff: mine("staff")?.id,
    partner: mine("partners")?.id,
    student: mine("students")?.id,
    cycle: mine("review_cycles")?.id,
  };
  const fill: Array<[RegExp, string | undefined]> = [
    [/\/(board|organization\/board)\/\[id\]/, id.board],
    [/\/capture\/\[id\]/, id.capture],
    [/\/cohorts\/\[id\]/, id.cohort],
    [/\[sessionId\]/, id.session],
    [/\/editions\/\[id\]/, id.edition],
    [/\/(comms\/emails|fundraising\/comms)\/\[id\]/, id.email],
    [/\/stories\/\[id\]/, id.story],
    [/\/compliance\/\[id\]/, id.compliance],
    [/\/asks\/\[id\]/, id.ask],
    [/\/gift-tables\/\[id\]/, id.giftTable],
    [/\/(donors-funders|donors)\/\[id\]/, id.constituent],
    [/\/grants\/\[id\]/, id.grant],
    [/\/pipeline\/\[id\]/, id.opp],
    [/\/plan\/\[id\]/, id.strategy],
    [/\/pledges\/\[id\]/, id.pledge],
    [/\/prospects\/\[id\]/, id.prospect],
    [/\[hubspot_id\]/, id.hubspot],
    [/\/strategy\/\[key\]/, id.angle],
    [/\/meetings\/\[id\]/, id.meeting],
    [/\[eventId\]/, id.event],
    [/\/projects\/\[id\]/, id.project],
    [/\/objective\/\[id\]/, id.objective],
    [/\/(staff|organization\/team)\/\[id\]/, id.staff],
    [/\/partners\/\[id\]/, id.partner],
    [/\/(students|programs\/people)\/\[id\]/, id.student],
    [/\[cycleId\]/, id.cycle],
  ];
  return adminPatterns().map((pattern) => {
    let url = pattern;
    let missing = false;
    for (const [re, v] of fill) {
      if (!re.test(url)) continue;
      if (!v) missing = true;
      url = url.replace(/\[[a-zA-Z_]+\](?=\/|$)/, () => v ?? "00000000-0000-4000-8000-000000000000");
      // a route can carry two params (cohort + session): loop until none of this kind remain
    }
    url = url.replace(/\/\[\.\.\.not_found\]$/, "/this-page-does-not-exist");
    return { pattern, url, missing: missing || /\[/.test(url) };
  });
}
