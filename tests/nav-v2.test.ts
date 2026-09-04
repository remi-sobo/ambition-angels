import { describe, expect, test } from "vitest";
import {
  V2_DESTINATIONS,
  V2_INBOX,
  resolveV2Destination,
  resolveV2Nav,
} from "@/lib/admin/nav";

// Spec B, stage B1 — the two rules the V2 nav model exists to enforce:
//   1. a destination's landing tab is computed (first entitled survivor);
//   2. a destination whose tab list resolves empty is hidden.
//
// Fixtures are the four live orgs' enabled feature_key sets as of 2026-09-03
// (AA includes modules.content per seed_aa_modules_content.sql), plus a
// synthetic set that resolves a destination to zero tabs — no live org hits
// that today; the fifth tenant will.

const AA = [
  "aa.app", "aa.bv", "aa.demoday", "aa.hubspot_mirror", "aa.internships",
  "aa.mesa", "aa.quiz", "aa.site_analytics", "aa.ygb",
  "ai.prospect_research", "ai.reed", "coaching",
  "modules.board", "modules.comms", "modules.compliance", "modules.content",
  "modules.documents", "modules.finance", "modules.fundraising",
  "modules.meetings", "modules.messages", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program", "modules.reviews", "modules.staff",
  "modules.strategy",
];

const YGB = [
  "ai.prospect_research", "ai.reed", "coaching",
  "modules.board", "modules.comms", "modules.compliance", "modules.documents",
  "modules.finance", "modules.fundraising", "modules.meetings",
  "modules.messages", "modules.metrics", "modules.ops", "modules.partners",
  "modules.program", "modules.reviews", "modules.staff", "modules.strategy",
];

// Young Life EPA and SafeSpace hold the identical nine keys.
const NINE_KEY = [
  "modules.board", "modules.compliance", "modules.documents",
  "modules.finance", "modules.fundraising", "modules.metrics", "modules.ops",
  "modules.partners", "modules.program",
];

// Synthetic: a tenant with no governance/strategy/staff keys at all —
// Organization must resolve to zero tabs and disappear.
const NO_GOVERNANCE = ["modules.fundraising", "modules.finance", "modules.program"];

const dest = (key: string) => {
  const d = V2_DESTINATIONS.find((d) => d.key === key);
  if (!d) throw new Error(`no destination ${key}`);
  return d;
};

const tabKeys = (features: string[], key: string) =>
  resolveV2Destination(dest(key), features)?.tabs.map((t) => t.key) ?? null;

describe("V2 nav: the locked map", () => {
  test("seven destinations, declared once", () => {
    expect(V2_DESTINATIONS.map((d) => d.key)).toEqual([
      "home", "work", "programs", "fundraising", "finance", "impact", "organization",
    ]);
  });

  test("no destination declares a constant landing — landing is always computed", () => {
    for (const d of V2_DESTINATIONS) {
      expect(d).not.toHaveProperty("lands");
      expect(d).not.toHaveProperty("landingTab");
    }
  });
});

describe("rule 1: first-entitled-tab landing", () => {
  test("Organization lands on Strategy for AA and YGB", () => {
    for (const features of [AA, YGB]) {
      const org = resolveV2Destination(dest("organization"), features)!;
      expect(org.landingTab.key).toBe("strategy");
      expect(org.href).toBe("/admin/organization/strategy");
    }
  });

  test("Organization lands on Board for the two 9-key orgs", () => {
    const org = resolveV2Destination(dest("organization"), NINE_KEY)!;
    expect(org.tabs.map((t) => t.key)).toEqual(["board", "compliance"]);
    expect(org.landingTab.key).toBe("board");
    expect(org.href).toBe("/admin/organization/board");
  });

  test("the same declaration yields different landings per tenant (never a constant)", () => {
    const aa = resolveV2Destination(dest("organization"), AA)!;
    const nine = resolveV2Destination(dest("organization"), NINE_KEY)!;
    expect(aa.landingTab.key).not.toBe(nine.landingTab.key);
  });

  test("Work lands on Plan & Close everywhere it exists, and shrinks for 9-key orgs", () => {
    expect(tabKeys(AA, "work")).toEqual([
      "plan-close", "my-week", "tasks", "projects", "meetings", "documents",
    ]);
    expect(tabKeys(NINE_KEY, "work")).toEqual(["plan-close", "tasks", "projects", "documents"]);
    expect(resolveV2Destination(dest("work"), NINE_KEY)!.landingTab.key).toBe("plan-close");
  });

  test("Programs drops Content without modules.content; Impact drops Analytics without aa.site_analytics", () => {
    expect(tabKeys(AA, "programs")).toContain("content");
    expect(tabKeys(YGB, "programs")).not.toContain("content");
    expect(tabKeys(NINE_KEY, "programs")).toEqual([
      "overview", "people", "intake", "cohorts", "attendance", "partners",
    ]);
    expect(tabKeys(AA, "impact")).toEqual(["outcomes", "kpis", "analytics", "reports"]);
    expect(tabKeys(NINE_KEY, "impact")).toEqual(["outcomes", "kpis", "reports"]);
    expect(resolveV2Destination(dest("impact"), NINE_KEY)!.landingTab.key).toBe("outcomes");
  });

  test("Inbox keeps its base tab for everyone and drops Messages without modules.messages", () => {
    expect(resolveV2Destination(V2_INBOX, AA)!.tabs.map((t) => t.key)).toEqual(["inbox", "messages"]);
    expect(resolveV2Destination(V2_INBOX, NINE_KEY)!.tabs.map((t) => t.key)).toEqual(["inbox"]);
  });
});

describe("rule 2: a zero-tab destination is hidden", () => {
  test("Organization disappears for a tenant with no governance keys", () => {
    expect(resolveV2Destination(dest("organization"), NO_GOVERNANCE)).toBeNull();
    const nav = resolveV2Nav(NO_GOVERNANCE);
    expect(nav.destinations.map((d) => d.key)).not.toContain("organization");
    // Home never disappears: its tabs are ungated platform surfaces.
    expect(nav.destinations.map((d) => d.key)).toContain("home");
  });

  test("all four live orgs still see all seven destinations", () => {
    for (const features of [AA, YGB, NINE_KEY]) {
      expect(resolveV2Nav(features).destinations).toHaveLength(7);
    }
  });

  test("an empty entitlement set leaves only the ungated surfaces", () => {
    const nav = resolveV2Nav([]);
    expect(nav.destinations.map((d) => d.key)).toEqual(["home"]);
    expect(nav.inbox!.tabs.map((t) => t.key)).toEqual(["inbox"]);
  });

  test("null features (pre-auth shell) shows the full IA, per the V1 convention", () => {
    expect(resolveV2Nav(null).destinations).toHaveLength(7);
  });
});

describe("terminology on tab labels (B4 groundwork)", () => {
  test("Cohorts resolves the tenant's own word, defaulting to the built-in", () => {
    const label = (terms: Record<string, string> | null) =>
      resolveV2Destination(dest("programs"), NINE_KEY, terms)!.tabs.find((t) => t.key === "cohorts")!.label;
    expect(label(null)).toBe("Cohorts"); // AA has zero org_terminology rows by design
    expect(label({ cohort: "Groups" })).toBe("Groups"); // Young Life EPA
    expect(label({ cohort: "Crews" })).toBe("Crews"); // YGB
  });

  test("Team and Board tabs resolve staff/board terms", () => {
    const org = resolveV2Destination(dest("organization"), AA, { staff: "Team-mates", board: "Committee" })!;
    expect(org.tabs.find((t) => t.key === "team")!.label).toBe("Team-mates");
    expect(org.tabs.find((t) => t.key === "board")!.label).toBe("Committee");
  });
});
