import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import writeXlsxFile from "write-excel-file/node";
import {
  closeSnapshot,
  gaps,
  slotNames,
  stageRoles,
  tableGoal,
  tableShape,
  type GiftLevel,
  type Placement,
  type PoolCandidate,
  type PoolKey,
} from "@/lib/fundraising/gift-table";
import { buildWorkbook } from "@/lib/fundraising/gift-table-workbook";
import type { GiftTableRow, GiftTableSpine } from "@/lib/fundraising/gift-table-server";

/**
 * Phase 5: close, plan vs actual, and the workbook
 * (specs/fundraising-gift-tables.md, Phase 5).
 *
 * The workbook half is tested by BUILDING one and reading it back out of the
 * zip, not by asserting on source text. An export that typechecks but produces
 * a corrupt file, or silently drops a sheet, is the exact failure a source
 * assertion cannot see.
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ── Fixture: AA's year-end table, the spec's DoD numbers ────────────────────

const table: GiftTableRow = {
  id: "t1",
  name: "AA Year End 2026",
  startsOn: "2026-09-14",
  endsOn: "2026-12-31",
  status: "active",
  target: 350000,
  multiplier: 1.2,
  goalRoundTo: null,
  coverageBasis: "window",
  defaultTermYears: 1,
  monthlyModeledYears: 1,
  targetRationale: "Board-approved year-end number.",
  multiplierRationale: "Slippage at 1.2.",
  notes: null,
  campaignId: null,
  closedAt: null,
  closedSnapshot: null,
};

const levels: GiftLevel[] = [
  { id: "l1", label: "01", amount: 75000, cadence: "one_time", termYears: null, giftsNeeded: 1, prospectsPerGift: 4, purpose: "Lead gift", sort: 1 },
  { id: "l2", label: "02", amount: 50000, cadence: "one_time", termYears: null, giftsNeeded: 2, prospectsPerGift: 4, purpose: null, sort: 2 },
];

const placement = (over: Partial<Placement> = {}): Placement => ({
  id: "p1",
  levelId: "l1",
  constituentId: "c1",
  householdId: null,
  displayName: "The Chen Household",
  targetAmount: 75000,
  cadence: null,
  termYears: null,
  capacityScore: 5,
  affinityScore: 4,
  connectionScore: 3,
  readinessScore: 4,
  warmPath: "Board member Ana introduced them in 2024",
  status: "ready",
  nextStep: "Ask meeting",
  nextStepDue: "2026-10-01",
  owner: "Shannon",
  doNotContact: false,
  opportunity: null,
  ...over,
});

const roles = stageRoles([
  { key: "ask", stageType: "open", countsAsPledged: false },
  { key: "won", stageType: "won", countsAsPledged: false },
]);

function spineWith(placements: Placement[]): GiftTableSpine {
  const slots = slotNames(levels, placements, table, roles);
  return {
    table,
    levels,
    placements,
    credits: [],
    roles,
    stages: [
      { key: "ask", stageType: "open", countsAsPledged: false },
      { key: "won", stageType: "won", countsAsPledged: false },
    ],
    goal: tableGoal(table),
    shape: tableShape(levels, table),
    slots,
    gaps: gaps(slots),
  };
}

const emptyPools = {
  active_asks: [], pledged: [], renewals: [], lapsed: [],
  upgrades: [], bench: [], recurring: [],
} as Record<PoolKey, PoolCandidate[]>;

/** Build the real workbook and read the sheets back out of the zip. */
async function workbook(spine: GiftTableSpine, pools = emptyPools) {
  const buffer = await writeXlsxFile(
    buildWorkbook({ spine, pools, today: "2026-12-31" }),
  ).toBuffer();
  const files = unzipSync(new Uint8Array(buffer));
  const names = Array.from(
    strFromU8(files["xl/workbook.xml"]).matchAll(/<sheet[^>]*\bname="([^"]+)"/g),
  ).map((m) => m[1]);
  const strings = files["xl/sharedStrings.xml"]
    ? strFromU8(files["xl/sharedStrings.xml"])
    : "";
  return { buffer, files, names, strings };
}

describe("the workbook is a real four-sheet xlsx", () => {
  test("it is a valid zip with the four named sheets, in order", async () => {
    const { buffer, names } = await workbook(spineWith([placement()]));
    // "PK" is the zip magic number. An .xlsx that is not a zip is a file that
    // Excel refuses to open, and no type ever catches it.
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(names).toEqual(["Start Here", "Gift Table", "Inventory", "Pools"]);
  });

  test("Start Here states the basis in words, not just the enum", async () => {
    // The workbook leaves Bloom. Whoever opens it cannot ask what "window"
    // means, so the sheet says what each figure counts.
    const { strings } = await workbook(spineWith([placement()]));
    expect(strings).toContain("Every figure counts money landing inside the window");
    expect(strings).toContain("2026-09-14 to 2026-12-31");
  });

  test("it carries the rationale, which is the part a spreadsheet loses", async () => {
    const { strings } = await workbook(spineWith([placement()]));
    expect(strings).toContain("Board-approved year-end number.");
    expect(strings).toContain("Slippage at 1.2.");
  });

  test("a placed name reaches Inventory with its warm path", async () => {
    const { strings } = await workbook(spineWith([placement()]));
    expect(strings).toContain("The Chen Household");
    expect(strings).toContain("Board member Ana introduced them in 2024");
  });

  test("a do-not-contact donor travels WITH the flag", async () => {
    // A workbook that dropped it is how somebody gets called anyway.
    const { strings } = await workbook(spineWith([placement({ doNotContact: true })]));
    expect(strings).toContain("DO NOT CONTACT");
  });

  test("pool rows say they are candidates, not names on the table", async () => {
    const pools = {
      ...emptyPools,
      renewals: [
        {
          constituentId: "c9", householdId: null, label: "Rivera Fund",
          detail: "Gave $10,000 in 2025", amount: 10000,
          doNotContact: false, placeable: true,
        },
      ],
    };
    const { strings } = await workbook(spineWith([placement()]), pools);
    expect(strings).toContain("Rivera Fund");
    expect(strings).toContain("A pool row counts toward nothing");
  });

  test("an empty table still produces an openable workbook", async () => {
    // The first thing anyone does is export before filling it in.
    const { buffer, names } = await workbook(spineWith([]));
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(names).toHaveLength(4);
  });
});

describe("the workbook agrees with the screen", () => {
  test("goal and shape are the spine's, not recomputed", async () => {
    const spine = spineWith([placement()]);
    // The spec's DoD: $350,000 x 1.2 = $420,000.
    expect(spine.goal).toBe(420000);
    const { strings } = await workbook(spine);
    // The verdict sentence is generated by the same verdict() the page renders.
    expect(strings).toContain("$420,000");
  });

  test("the builder never queries or recomputes", () => {
    const src = read("lib/fundraising/gift-table-workbook.ts");
    // It takes a spine and formats it. The moment it derives its own credit
    // values, the workbook can disagree with the table it came from.
    expect(src).not.toMatch(/from\(\s*["'`]/);
    expect(src).not.toContain("creditedValue");
    expect(src).not.toContain("slotNames");
    expect(src).not.toContain("tableGoal");
  });
});

describe("closing freezes plan vs actual", () => {
  const spine = spineWith([placement()]);
  const snap = closeSnapshot({
    table,
    slots: spine.slots,
    goal: spine.goal,
    shape: spine.shape,
    gaps: spine.gaps,
    closedOn: "2026-12-31",
  });

  test("the snapshot records conversion per level", () => {
    // Placed names that became committed money: the number next year's table
    // is built on, and the one nobody writes down.
    const lead = snap.levels.find((l) => l.levelId === "l1")!;
    expect(lead.placed).toBe(1);
    expect(lead.committed).toBe(0);
    expect(lead.conversion).toBe(0);
  });

  test("a committed name converts", () => {
    const won = spineWith([
      placement({
        opportunity: {
          id: "o1", stage: "won", askAmount: 75000,
          expectedClose: null, nextStep: null, nextStepDue: null, owner: null,
        },
      }),
    ]);
    const s = closeSnapshot({
      table, slots: won.slots, goal: won.goal, shape: won.shape,
      gaps: won.gaps, closedOn: "2026-12-31",
    });
    const lead = s.levels.find((l) => l.levelId === "l1")!;
    expect(lead.committed).toBe(1);
    expect(lead.conversion).toBe(1);
  });

  test("the snapshot keeps the basis, so it cannot be reread on another one", () => {
    expect(snap.coverageBasis).toBe("window");
  });
});

describe("the lifecycle refuses the moves that would lose the record", () => {
  const src = read("app/api/admin/fundraising/gift-tables/[id]/close/route.ts");

  test("only an active table can be closed", () => {
    expect(src).toMatch(/close:\s*\{\s*from:\s*\["active"\]/);
  });

  test("archiving requires a closed table, so nothing is filed away unrecorded", () => {
    expect(src).toMatch(/archive:\s*\{\s*from:\s*\["closed"\]/);
  });

  test("reopening does not erase the snapshot", () => {
    // Only the close branch writes closed_snapshot; nothing nulls it.
    expect(src).toContain("update.closed_snapshot = closeSnapshot(");
    expect(src).not.toMatch(/closed_snapshot:\s*null/);
  });

  test("the snapshot comes from the shared spine, not a second derivation", () => {
    expect(src).toContain("loadGiftTableSpine");
    expect(src).not.toContain("slotNames");
  });

  test("the plain edit route still cannot set closed or archived", () => {
    // A PATCH to status='closed' would leave a closed table with no snapshot.
    const edit = read("app/api/admin/fundraising/gift-tables/route.ts");
    expect(edit).toContain('const SETTABLE_STATUS = ["draft", "active"] as const');
  });
});

describe("plan vs actual shows drift rather than hiding it", () => {
  const src = read(
    "app/admin/fundraising/campaigns/gift-tables/[id]/_components/PlanVsActual.tsx",
  );

  test("the frozen figures are rendered beside the live ones", () => {
    expect(src).toContain("liveGoal");
    expect(src).toContain("liveShape");
  });

  test("a level deleted after close says so instead of reading as zero", () => {
    expect(src).toContain("level removed");
  });

  test("the panel never recomputes the snapshot", () => {
    expect(src).not.toContain("closeSnapshot");
    expect(src).not.toContain("slotNames");
  });
});

describe("archived tables are hidden, never unreachable", () => {
  const page = read("app/admin/fundraising/campaigns/page.tsx");
  const section = read("app/admin/fundraising/campaigns/_components/GiftTablesSection.tsx");

  test("the default list still excludes archived", () => {
    expect(page).toContain('.neq("status", "archived")');
  });

  test("the archive is a shareable link, not hidden client state", () => {
    expect(page).toContain('searchParams?.archived === "1"');
    expect(section).toContain("/admin/fundraising/campaigns?archived=1");
  });

  test("closed tables stay in the working list, because plan vs actual is the point", () => {
    expect(page).not.toContain('.neq("status", "closed")');
  });
});
