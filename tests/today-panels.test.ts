import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decisionLine, dueLabel, isMine, panelsOf, rankMine, selectTodayPanels, weekStart } from "@/lib/admin/todayPanels";
import { donorsNeedingMe } from "@/lib/admin/todayDonors";

// V4 Stage C (spec §7): Today's panels are chosen by permission and filled by
// assignment. Role permissions are the seed in create_bloomos_core.sql, plus
// capture.use for every role (capture_use_permission.sql).

const ROLE: Record<string, string[]> = {
  owner: ["org.manage", "members.manage", "program.read", "program.write", "fundraising.read", "fundraising.write", "finance.read", "finance.write", "ops.read", "ops.write", "board.read", "board.write", "compliance.read", "compliance.write", "reports.read", "capture.use"],
  admin: ["org.manage", "members.manage", "program.read", "program.write", "fundraising.read", "fundraising.write", "finance.read", "finance.write", "ops.read", "ops.write", "board.read", "board.write", "compliance.read", "compliance.write", "reports.read", "capture.use"],
  staff: ["program.read", "program.write", "fundraising.read", "fundraising.write", "finance.read", "ops.read", "ops.write", "compliance.read", "reports.read", "capture.use"],
  finance: ["finance.read", "finance.write", "compliance.read", "reports.read", "capture.use"],
  board_viewer: ["board.read", "reports.read", "metrics.read", "capture.use"],
};
const ALL = ["modules.finance", "modules.fundraising", "modules.program", "ai.capture"];
const layoutFor = (role: string, features = ALL) => selectTodayPanels({ permissions: ROLE[role], features });

describe("selectTodayPanels: by role", () => {
  test("owner: mine, money, my day; below donors and team; Talk to log", () => {
    const l = layoutFor("owner");
    expect(l.kind).toBe("lead");
    expect(l.top).toEqual(["mine", "money", "myDay"]);
    expect(l.below).toEqual(["donorsNeedMe", "teamWeek"]);
    expect(l.primary).toBe("talk");
    expect(l.readOnly).toBe(false);
  });

  test("admin gets the owner's frame (both hold org.manage)", () => {
    expect(layoutFor("admin")).toEqual(layoutFor("owner"));
  });

  test("finance: the books, money, my day; Talk to log (voice for every role, capture.use)", () => {
    const l = layoutFor("finance");
    expect(l.kind).toBe("finance");
    expect(l.top).toEqual(["financeQueue", "money", "myDay"]);
    expect(l.below).toEqual(["mine"]);
    expect(l.primary).toBe("talk");
  });

  test("staff: their work, their donors and cohorts; never money, even with finance.read", () => {
    const l = layoutFor("staff");
    expect(l.kind).toBe("staff");
    expect(l.top).toEqual(["mine", "myDay"]);
    expect(l.below).toEqual(["donorsNeedMe", "myCohorts"]);
    expect(panelsOf(l).has("money")).toBe(false);
    expect(l.primary).toBe("talk");
  });

  test("board viewer: a read-only summary, no money; Talk to log is the one thing they can add", () => {
    const l = layoutFor("board_viewer");
    expect(l.kind).toBe("readonly");
    expect(l.readOnly).toBe(true);
    expect(l.top).toEqual(["boardSummary"]);
    expect(l.below).toEqual([]);
    expect(l.primary).toBe("talk");
    // Without ai.capture a board viewer gets no quick add (it needs ops.write).
    expect(layoutFor("board_viewer", ["modules.finance"]).primary).toBeNull();
    expect(layoutFor("finance", ["modules.finance"]).primary).toBeNull();
  });

  test("no money without the finance module, whatever the role", () => {
    expect(panelsOf(layoutFor("owner", ["modules.fundraising", "ai.capture"])).has("money")).toBe(false);
    expect(panelsOf(layoutFor("finance", []))).toEqual(new Set(["myDay", "mine"]));
  });

  test("no money without finance.read, even for a lead role", () => {
    const perms = ROLE.owner.filter((p) => p !== "finance.read");
    expect(panelsOf(selectTodayPanels({ permissions: perms, features: ALL })).has("money")).toBe(false);
  });

  test("an org without ai.capture keeps the quick add", () => {
    expect(layoutFor("owner", ["modules.finance", "modules.fundraising"]).primary).toBe("quick_add");
    expect(layoutFor("staff", ["modules.program"]).primary).toBe("quick_add");
  });

  test("panels follow modules: staff in a program-only org see cohorts, not donors", () => {
    expect(layoutFor("staff", ["modules.program"]).below).toEqual(["myCohorts"]);
  });

  test("the first row never holds more than three panels", () => {
    for (const r of Object.keys(ROLE)) expect(layoutFor(r).top.length).toBeLessThanOrEqual(3);
  });
});

describe("isMine: owner_id first, the text owner as fallback", () => {
  const me = { userId: "u-remi", handle: "remi" };
  test("owner_id decides when set", () => {
    expect(isMine({ owner_id: "u-remi" }, me)).toBe(true);
    expect(isMine({ owner_id: "u-shannon", owner_text: "remi" }, me)).toBe(false);
  });
  test("the old handle only counts when there is no owner_id", () => {
    expect(isMine({ owner_id: null, owner_text: "Remi" }, me)).toBe(true);
    expect(isMine({ owner_id: null, owner_text: "shannon" }, me)).toBe(false);
    expect(isMine({ owner_id: null, owner_text: null }, me)).toBe(false);
    expect(isMine({ owner_text: "remi" }, { userId: "x", handle: null })).toBe(false);
  });
});

describe("ranking and due labels", () => {
  const today = "2026-11-23";
  test("overdue first, most overdue on top, then today, then soon, then undated", () => {
    const ranked = rankMine(
      [
        { title: "b", due: null },
        { title: "c", due: "2026-11-25" },
        { title: "d", due: "2026-11-23" },
        { title: "e", due: "2026-11-11" },
        { title: "f", due: "2026-11-20" },
      ],
      today,
    );
    expect(ranked.map((r) => r.title)).toEqual(["e", "f", "d", "c", "b"]);
  });
  test("labels say how late", () => {
    expect(dueLabel("2026-11-11", today)).toEqual({ text: "12 days late", tone: "late" });
    expect(dueLabel("2026-11-22", today)).toEqual({ text: "1 day late", tone: "late" });
    expect(dueLabel(today, today).text).toBe("Due today");
    expect(dueLabel("2026-11-24", today).text).toBe("Due tomorrow");
    expect(dueLabel(null, today).tone).toBe("none");
  });
  test("weeks start on Monday", () => {
    expect(weekStart("2026-11-23")).toBe("2026-11-23"); // Monday
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // Sunday
    expect(weekStart("2026-11-25")).toBe("2026-11-23");
  });
});

describe("decisionLine", () => {
  test("names the first late thing", () => {
    expect(
      decisionLine({ layout: "lead", mine: { late: 3, dueToday: 1, first: "Send year-end ask to Dana Whitfield" }, money: { runwayMonths: 7.4, stale: false } }),
    ).toBe('3 things of yours are late. Start with "Send year-end ask to Dana Whitfield". Runway is steady at 7.4 months.');
  });
  test("plain when nothing is late; flags stale cash instead of a number", () => {
    expect(decisionLine({ layout: "lead", mine: { late: 0, dueToday: 0, first: null }, money: { runwayMonths: 7, stale: true } })).toBe(
      "Nothing of yours is late or due today. The cash balance is out of date.",
    );
  });
  test("finance starts with the books", () => {
    expect(decisionLine({ layout: "finance", mine: { late: 0, dueToday: 0, first: null }, financeQueue: { uncategorized: 14, proposals: 2 } })).toBe(
      "Start with the books: 14 transactions still need a category.",
    );
  });
  test("board viewer is told it is read only", () => {
    expect(decisionLine({ layout: "readonly", mine: { late: 0, dueToday: 0, first: null } })).toMatch(/read-only/);
  });
  test("waiting recordings are mentioned", () => {
    expect(decisionLine({ layout: "staff", mine: { late: 0, dueToday: 2, first: null }, captureWaiting: 1 })).toBe(
      "Nothing of yours is late. 2 things are due today. 1 recording still has cards to confirm.",
    );
  });
});

describe("donorsNeedingMe", () => {
  const today = "2026-11-23";
  const donors = [
    { id: "a", name: "Elena Brandt" },
    { id: "b", name: "Jon and Mei Castellano" },
    { id: "c", name: "Priya Raman" },
    { id: "d", name: "Okafor Family" },
    { id: "e", name: "Harlow Family Fund" },
  ];
  const gifts = [
    { constituent_id: "a", gift_date: "2024-12-02", amount: 2000, acknowledgment_status: "sent" },
    { constituent_id: "c", gift_date: "2026-11-19", amount: 50, acknowledgment_status: "pending" },
    { constituent_id: "d", gift_date: "2026-10-01", amount: 500, acknowledgment_status: "sent" },
  ];
  const asks = [
    { constituent_id: "b", next_step: null, next_step_due: null, stage: "cultivate" },
    { constituent_id: "e", next_step: "Renewal call", next_step_due: "2026-11-20", stage: "solicit" },
    { constituent_id: "d", next_step: "Send report", next_step_due: "2026-12-10", stage: "steward" },
  ];
  test("late steps, then unthanked, then lapsing, then no step; healthy donors drop out", () => {
    const out = donorsNeedingMe(donors, gifts, asks, today);
    expect(out.map((d) => [d.name, d.reason])).toEqual([
      ["Harlow Family Fund", "late"],
      ["Priya Raman", "unthanked"],
      ["Elena Brandt", "lapsing"],
      ["Jon and Mei Castellano", "stepless"],
    ]);
    expect(out[0].why).toBe('Next step "Renewal call" is 3 days late');
    expect(out[2].why).toBe("Lapsing. Last gift $2,000, Dec 2024");
    for (const d of out) expect(d.href).toBe(`/admin/fundraising/donors-funders/${d.id}`);
  });
});

describe("source guards: Today", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  test("the page and its loaders never import the service-role client", () => {
    for (const p of ["app/admin/today/page.tsx", "lib/admin/todayRole.ts", "lib/admin/todayPanels.ts", "app/admin/today/_components/TodayPanels.tsx"]) {
      expect(read(p), p).not.toMatch(/lib\/supabase\/admin|getSupabaseAdmin/);
    }
  });
  test("every Today loader read is fenced to the active org", () => {
    const src = read("lib/admin/todayRole.ts");
    const froms = src.match(/\.from\("/g)?.length ?? 0;
    const fences = src.match(/\.eq\("org_id", orgId\)/g)?.length ?? 0;
    expect(froms).toBeGreaterThan(5);
    expect(fences).toBe(froms);
  });
  test("panels come from selectTodayPanels and money needs the panel as well as finance.read", () => {
    const src = read("app/admin/today/page.tsx");
    expect(src).toMatch(/selectTodayPanels\(\{ permissions: perms/);
    expect(src).toMatch(/\(await ctxHasPermission\(ctx, "finance\.read"\)\) && panels\.has\("money"\)/);
  });
  test("Talk to log falls back to the quick add, and never turns capture on", () => {
    const src = read("app/admin/today/_components/TalkToLog.tsx");
    expect(src).toMatch(/openCapture\(\)/);
    expect(src).toMatch(/<QuickAddModal/);
    expect(src).not.toMatch(/org_entitlements|fetch\(/);
  });
});
