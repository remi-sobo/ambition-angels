import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asSentence, daysBetween, dueText, givingSummary, nextStepData, shortDay, usd, yearOverYear } from "@/lib/fundraising/donorRecord";
import {
  boardSummary,
  cardUrgency,
  columnStats,
  columnsForView,
  filterBoard,
  quarterEnd,
  quarterStart,
  searchOpps,
  type BoardOpp,
} from "@/lib/fundraising/pipelineBoard";
import { filterThankYous, nextStepFor, pageOf, sortThankYous, thankSummary } from "@/lib/fundraising/thankYouList";

// V4 Stage B1 (Fundraising): the pure logic behind the donor record's
// summary strip and next-step bar, the Pipeline board, and the Thank-yous
// list, plus the source guards for the pages that use them.

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const TODAY = "2026-11-21";

describe("donor record: giving summary", () => {
  const history = [
    { gift_date: "2019-04-12", amount: "5000" },
    { gift_date: "2025-03-01", amount: 12000 },
    { gift_date: "2026-01-15", amount: 5000 },
    { gift_date: "2026-10-03", amount: 10000 },
  ];

  test("lifetime, last gift and this year vs last year come from the full history", () => {
    const s = givingSummary(history, TODAY);
    expect(s.lifetime).toBe(32000);
    expect(s.count).toBe(4);
    expect(s.firstDate).toBe("2019-04-12");
    expect(s.last).toEqual({ amount: 10000, date: "2026-10-03" });
    expect(s.thisYear).toEqual({ total: 15000, count: 2 });
    expect(s.lastYear).toEqual({ total: 12000, count: 1 });
  });

  test("a donor with no gifts is a real zero, with no last gift", () => {
    const s = givingSummary([], TODAY);
    expect(s).toMatchObject({ lifetime: 0, count: 0, firstDate: null, last: null });
  });

  test("this year never counts a future-dated gift", () => {
    expect(givingSummary([{ gift_date: "2026-12-31", amount: 100 }], TODAY).thisYear.total).toBe(0);
  });

  test("year over year reads in words, or nothing with no history", () => {
    expect(yearOverYear(15000, 12000, usd)).toBe("Up $3,000");
    expect(yearOverYear(500, 1000, usd)).toBe("Down $500");
    expect(yearOverYear(10, 10, usd)).toBe("Same as last year");
    expect(yearOverYear(0, 0, usd)).toBeNull();
  });
});

describe("donor record: next-step wording", () => {
  test("late steps say how late; others when they are due", () => {
    expect(dueText("2026-11-09", TODAY)).toEqual({ text: "12 days late.", late: true, daysLate: 12 });
    expect(dueText("2026-11-20", TODAY)).toMatchObject({ text: "1 day late.", late: true });
    expect(dueText(TODAY, TODAY)).toMatchObject({ text: "Due today.", late: false });
    expect(dueText("2026-11-22", TODAY).text).toBe("Due tomorrow.");
    expect(dueText("2026-11-28", TODAY).text).toBe("Due Nov 28.");
    expect(dueText("2027-01-04", TODAY).text).toBe("Due Jan 4, 2027.");
  });

  test("days, short days, sentences and money", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(shortDay("2026-03-09", TODAY)).toBe("Mar 9");
    expect(shortDay("2025-03-09", TODAY)).toBe("Mar 9, 2025");
    expect(asSentence("Send year-end ask")).toBe("Send year-end ask.");
    expect(asSentence("Call her?")).toBe("Call her?");
    expect(usd(25000)).toBe("$25,000");
    expect(usd(1250.5)).toBe("$1,250.50");
  });

  test("the preview's step is the record's: soonest-due open ask, else the first open ask", () => {
    const ask = (id: string, o: Partial<Parameters<typeof nextStepData>[0][number]> = {}) => ({
      id, name: null, open: true, next_step: null, next_step_due: null, ask_amount: null, owner: null, ...o,
    });
    const s = nextStepData(
      [
        ask("a", { next_step: "Later step", next_step_due: "2026-12-01" }),
        ask("b", { next_step: "Send year-end ask", next_step_due: "2026-11-09", name: "Year-end ask", ask_amount: 25000, owner: "Remi" }),
        ask("c", { next_step: "Closed step", next_step_due: "2026-10-01", open: false }),
      ],
      TODAY,
    );
    expect(s).toEqual({
      oppId: "b",
      title: "Send year-end ask.",
      due: { text: "12 days late.", late: true },
      dueISO: "2026-11-09",
      meta: "Was due Nov 9. Owner: Remi. For the Year-end ask, $25,000. 2 open asks.",
    });
    expect(nextStepData([ask("x")], TODAY)).toMatchObject({ oppId: "x", title: null, due: undefined, meta: "For the open ask." });
    expect(nextStepData([ask("y", { open: false, next_step: "Old" })], TODAY)).toMatchObject({ oppId: null, title: null, meta: null });
  });
});

describe("pipeline board", () => {
  const stages = [
    { key: "researching", label: "Researching", stageType: "open" },
    { key: "ask_made", label: "Ask made", stageType: "open" },
    { key: "won", label: "Closed won", stageType: "won" },
    { key: "lost", label: "Closed lost", stageType: "lost" },
  ];
  const typeOf = (k: string) => stages.find((s) => s.key === k)?.stageType ?? "open";
  const opp = (o: Partial<BoardOpp>): BoardOpp => ({
    id: o.id ?? "x",
    label: o.label ?? "Ask",
    constituentName: o.constituentName ?? "Dana Whitfield",
    stage: o.stage ?? "ask_made",
    askAmount: o.askAmount ?? null,
    expectedClose: o.expectedClose ?? null,
    nextStep: o.nextStep ?? null,
    nextStepDue: o.nextStepDue ?? null,
    owner: o.owner ?? null,
  });
  const opps = [
    opp({ id: "a", stage: "researching", askAmount: 50000, expectedClose: "2027-03-01", nextStep: "Draft proposal", nextStepDue: "2026-12-05" }),
    opp({ id: "b", stage: "researching", askAmount: 10000, constituentName: "Marcus Oyelaran" }),
    opp({ id: "c", stage: "ask_made", askAmount: 25000, expectedClose: "2026-12-31", nextStep: "Send year-end ask", nextStepDue: "2026-11-09", owner: "Remi" }),
    opp({ id: "d", stage: "won", askAmount: 40000, expectedClose: "2026-06-01" }),
    opp({ id: "e", stage: "lost", askAmount: 5000 }),
  ];

  test("columns carry a count and a total asked, in stage order", () => {
    expect(columnStats(opps, stages)).toEqual([
      { key: "researching", label: "Researching", count: 2, total: 60000 },
      { key: "ask_made", label: "Ask made", count: 1, total: 25000 },
      { key: "won", label: "Closed won", count: 1, total: 40000 },
      { key: "lost", label: "Closed lost", count: 1, total: 5000 },
    ]);
    // A null ask counts as a card but adds nothing to the total.
    expect(columnStats([opp({ stage: "ask_made" })], stages)[1]).toMatchObject({ count: 1, total: 0 });
  });

  test("one urgency signal per card: late, missing, soon, calm; none when closed", () => {
    expect(cardUrgency(opps[2], "open", TODAY)).toEqual({ text: "12 days late", tone: "late" });
    expect(cardUrgency(opps[1], "open", TODAY)).toEqual({ text: "No next step yet", tone: "missing" });
    expect(cardUrgency(opp({ nextStep: "Call", nextStepDue: "2026-11-24" }), "open", TODAY)).toEqual({ text: "Due Nov 24", tone: "soon" });
    expect(cardUrgency(opps[0], "open", TODAY)).toEqual({ text: "Due Dec 5", tone: "calm" });
    expect(cardUrgency(opps[3], "won", TODAY).tone).toBe("none");
  });

  test("quarters", () => {
    expect(quarterStart(TODAY)).toBe("2026-10-01");
    expect(quarterEnd(TODAY)).toBe("2026-12-31");
    expect(quarterEnd("2026-02-10")).toBe("2026-03-31");
    expect(quarterEnd("2028-05-01")).toBe("2028-06-30");
  });

  test("views, quick filters and search", () => {
    const ids = (xs: BoardOpp[]) => xs.map((o) => o.id);
    expect(ids(filterBoard(opps, { view: "all", quick: [], q: "" }, typeOf, TODAY))).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids(filterBoard(opps, { view: "open", quick: [], q: "" }, typeOf, TODAY))).toEqual(["a", "b", "c"]);
    expect(ids(filterBoard(opps, { view: "quarter", quick: [], q: "" }, typeOf, TODAY))).toEqual(["c"]);
    expect(ids(filterBoard(opps, { view: "all", quick: ["late"], q: "" }, typeOf, TODAY))).toEqual(["c"]);
    expect(ids(filterBoard(opps, { view: "all", quick: ["no_next"], q: "" }, typeOf, TODAY))).toEqual(["b"]);
    expect(ids(filterBoard(opps, { view: "all", quick: ["large"], q: "" }, typeOf, TODAY))).toEqual(["a", "b", "c", "d"]);
    expect(ids(filterBoard(opps, { view: "all", quick: ["large", "no_next"], q: "" }, typeOf, TODAY))).toEqual(["b"]);
    expect(ids(searchOpps(opps, "marcus"))).toEqual(["b"]);
    expect(ids(searchOpps(opps, "remi"))).toEqual(["c"]);
    expect(columnsForView(stages, "open").map((s) => s.key)).toEqual(["researching", "ask_made"]);
    expect(columnsForView(stages, "all")).toHaveLength(4);
  });

  test("the summary strip totals what is in view", () => {
    expect(boardSummary(opps, typeOf, TODAY)).toEqual({
      openTotal: 85000,
      openCount: 3,
      quarterTotal: 25000,
      quarterCount: 1,
      noNextStep: 1,
      late: 1,
      wonTotal: 40000,
      wonCount: 1,
    });
  });
});

describe("thank-yous list", () => {
  const rows = [
    { id: "1", amount: 50, gift_date: "2026-11-12", email: "a@example.org" },
    { id: "2", amount: 1000, gift_date: "2026-11-16", email: null },
    { id: "3", amount: 250, gift_date: "2026-11-16", email: "c@example.org" },
  ];

  test("views", () => {
    expect(filterThankYous(rows, "receipt").map((r) => r.id)).toEqual(["2", "3"]);
    expect(filterThankYous(rows, "no_email").map((r) => r.id)).toEqual(["2"]);
    expect(filterThankYous(rows, "all")).toHaveLength(3);
  });

  test("sort: oldest first by default, stable ties, amount either way; paging", () => {
    expect(sortThankYous(rows, null).map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(sortThankYous(rows, { key: "amount", dir: "desc" }).map((r) => r.id)).toEqual(["2", "3", "1"]);
    expect(pageOf(["a", "b", "c", "d", "e"], 1, 2)).toEqual(["c", "d"]);
  });

  test("next step: send when there is an email and no offline preference", () => {
    expect(nextStepFor({ email: "a@example.org" })).toBe("send");
    expect(nextStepFor({ email: null })).toBe("mark");
    expect(nextStepFor({ email: "a@example.org", preferred: "letter" })).toBe("mark");
    expect(nextStepFor({ email: "a@example.org", preferred: "email" })).toBe("send");
  });

  test("summary", () => {
    expect(thankSummary(rows, TODAY)).toEqual({ count: 3, total: 1300, receiptCount: 2, oldestDays: 9, oldestDate: "2026-11-12" });
    expect(thankSummary([], TODAY)).toMatchObject({ count: 0, oldestDays: null });
  });
});

describe("B1 source guards", () => {
  test("Pipeline moves go through saveAction and the board offers a keyboard move", () => {
    const src = strip(read("app/admin/fundraising/_components/PipelineBoardV4.tsx"));
    expect(src).toMatch(/useSaveAction\(\)/);
    expect(src).toMatch(/aria-label=\{`Move \$\{title\} to another stage`\}/);
    expect(src).not.toMatch(/await fetch\(/);
  });

  test("the opportunity PATCH (moves, next steps) checks fundraising.write", () => {
    const src = strip(read("app/api/admin/opportunities/[id]/route.ts"));
    const patch = src.slice(src.indexOf("export async function PATCH"), src.indexOf("export async function DELETE"));
    expect(patch).toMatch(/requirePermission\("fundraising\.write"\)/);
  });

  test("the search preview's next-step bar is read-only without fundraising.write", () => {
    const route = strip(read("app/api/admin/search/profile/route.ts"));
    expect(route).toMatch(/ctxHasPermission\(ctx, "fundraising\.write"\)/);
    const view = strip(read("app/admin/_components/search/EntityProfile.tsx"));
    expect(view).toMatch(/<NextStepActions/);
    expect(view).toMatch(/readOnly=\{!step\.canEdit\}/);
    const lookup = strip(read("app/admin/lookup/page.tsx"));
    expect(lookup).toMatch(/canWrite && step\?\.source === "ask"/);
  });

  test("the next-step bar writes through saveAction with no optimistic update", () => {
    const src = strip(read("app/admin/fundraising/donors-funders/_components/NextStepActions.tsx"));
    expect(src).toMatch(/useSaveAction\(\)/);
    expect(src).not.toMatch(/optimistic\s*:/);
  });

  test("the donor record has ONE primary action and opens the gift drawer from it", () => {
    const src = strip(read("app/admin/fundraising/donors/[id]/DonorProfile.tsx"));
    expect(src).toMatch(/primaryAction=\{<RecordGiftButton constituentId=\{c\.id\} \/>\}/);
    expect(src).toMatch(/<EditGiftButton giftId=\{g\.id\}/);
    expect(src).toMatch(/<NextStepActions/);
    expect(src).toMatch(/<Timeline/);
    // Every Figure names its source.
    const figures = src.match(/<Figure[\s\S]*?\/>/g) ?? [];
    expect(figures.length).toBeGreaterThanOrEqual(4);
    for (const f of figures) expect(f).toMatch(/source=/);
  });

  test("every prior donor-record capability is still on the page", () => {
    const src = read("app/admin/fundraising/donors/[id]/DonorProfile.tsx");
    for (const piece of [
      "<EditDonorButton",
      "<AckChannelPref",
      "<ConstituentDangerZone",
      "<LogInteractionForm",
      "<LogThankYou",
      "<RecordButton",
      "<GiftRowActions",
      "<AddSoftCredit",
      "<SoftCreditChip",
      "<EmailActions",
      "<FiledNoteLine",
      "<EnrollInJourney",
      "<CancelEnrollment",
      "<NextMovePanel",
      "<CompanyPanel",
      "<Donor360Extras",
      "<HouseholdControls",
      "<EntityTasks",
      "<EntityDocuments",
      "<CommentThread",
      "<RailEntity",
      "prospects/by-hubspot/",
      "hsPledges",
      "hsComms",
      "plans.map",
    ]) {
      expect(src, piece).toContain(piece);
    }
  });

  test("Thank-yous is DataTable v2 with a next-step column and a bulk mark that sends nothing", () => {
    const src = strip(read("app/admin/fundraising/acknowledgments/AckQueue.tsx"));
    expect(src).toMatch(/<DataTable/);
    expect(src).toMatch(/nextStep=\{\{/);
    expect(src).toMatch(/url: "\/api\/admin\/acknowledgments\/mark\/bulk"/);
    expect(src).toMatch(/No email is sent\./);
  });

  test("Record a gift is the primary action on Donors & Funders and Thank-yous; Today rows open the drawer", () => {
    expect(read("app/admin/fundraising/donors-funders/page.tsx")).toMatch(/primaryAction=\{<RecordGiftButton \/>\}/);
    const queue = read("app/admin/fundraising/acknowledgments/AckQueue.tsx");
    expect(queue).toMatch(/primaryAction=\{<RecordGiftButton \/>\}/);
    expect(queue.match(/<ReviewGiftButton giftId=\{[gr]\.id\}/g)?.length).toBe(2);
  });
});
