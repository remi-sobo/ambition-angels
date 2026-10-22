import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAckContext, sourceLabel, type AckContextDonor, type AckContextGift } from "@/lib/admin/ackContext";
import { ackTaskLink, foldAckTasks } from "@/lib/admin/todayAck";
import type { StewardshipRule } from "@/lib/fundraising/stewardship";

// specs/needs-you-popout-thank-yous.md, PR 3: the acknowledgment panel's
// payload, one row per thank-you (tasks folded in), and the mark path.

const RULES: StewardshipRule[] = [
  { id: "r1", name: "First gift, personal welcome call", rank: 10, conditions: { first_gift: true, max_age_days: 30 }, action: "create_task_and_draft", channel: "call", template_id: null, sla_hours: 48, assignee: "shannon" },
  { id: "r2", name: "Major gift $1,000+, personal call", rank: 20, conditions: { min_amount: 1000, max_age_days: 30 }, action: "create_task", channel: "call", template_id: null, sla_hours: 24, assignee: "shannon" },
  { id: "r4", name: "Receipt-required gift $250 and up, personal email", rank: 40, conditions: { min_amount: 250, max_age_days: 30 }, action: "create_task", channel: "email", template_id: null, sla_hours: 48, assignee: "shannon" },
  { id: "r9", name: "Major gift, also a task for Remi", rank: 900, conditions: { min_amount: 1000, max_age_days: 30 }, action: "escalate", channel: "call", template_id: null, sla_hours: 24, assignee: "remi" },
];

const gift = (over: Partial<AckContextGift> = {}): AckContextGift => ({
  id: "g6",
  amount: 50000,
  gift_date: "2026-06-26",
  method: "other",
  external_source: "hubspot_deal",
  recurring_plan_id: null,
  notes: null,
  acknowledgment_status: "pending",
  constituent_id: "c1",
  ...over,
});
const donor = (over: Partial<AckContextDonor> = {}): AckContextDonor => ({
  id: "c1",
  type: "person",
  first_name: "Lynne",
  last_name: "O'Hara",
  org_name: null,
  emails: ["lynne@example.org"],
  preferred_ack_channel: null,
  do_not_contact: false,
  why_matters: null,
  ...over,
});
const history = [
  { id: "g1", gift_date: "2025-01-10", amount: 1000 },
  { id: "g2", gift_date: "2025-06-10", amount: 2000 },
  { id: "g6", gift_date: "2026-06-26", amount: 50000 },
];
const names = { campaign: null, fund: null, appeal: null };

describe("buildAckContext", () => {
  test("Lynne: major gift, call recommended by the rule, history and previous gift", () => {
    const c = buildAckContext({ gift: gift(), donor: donor(), history, rules: RULES, names });
    expect(c.donor).toMatchObject({ name: "Lynne O'Hara", firstName: "Lynne", email: "lynne@example.org", doNotContact: false });
    expect(c.history).toEqual({ ordinal: 3, lifetimeCount: 3, lifetimeTotal: 53000, previous: { date: "2025-06-10", amount: 2000 } });
    expect(c.recommendation).toMatchObject({ channel: "call", basis: "stewardship rule", major: true, escalationOwner: "remi" });
    expect(c.dueDate).toBe("2026-06-27");
    expect(c.sourceLabel).toBe("HubSpot");
    expect(c.receiptRequired).toBe(true);
  });

  test("the donor's own preferred channel wins over the rule", () => {
    const c = buildAckContext({ gift: gift(), donor: donor({ preferred_ack_channel: "letter" }), history, rules: RULES, names });
    expect(c.recommendation).toMatchObject({ channel: "letter", basis: "donor preference" });
  });

  test("Fast Forward: an organization with no email", () => {
    const c = buildAckContext({
      gift: gift({ id: "ff", amount: 20000 }),
      donor: donor({ type: "organization", first_name: null, last_name: null, org_name: "Fast Forward", emails: [] }),
      history: [{ id: "ff", gift_date: "2026-07-03", amount: 20000 }],
      rules: RULES,
      names,
    });
    expect(c.donor).toMatchObject({ name: "Fast Forward", firstName: null, isOrganization: true, email: null });
    expect(c.history.previous).toBeNull();
  });

  test("Erica: the gift note comes through; small gift, no escalation, default email", () => {
    const c = buildAckContext({
      gift: gift({ id: "e1", amount: 100, notes: " Follow-on after the gala. ", external_source: null }),
      donor: donor({ first_name: "Erica", last_name: "Fitzgerald" }),
      history: [{ id: "e0", gift_date: "2026-01-01", amount: 50 }, { id: "e1", gift_date: "2026-07-12", amount: 100 }],
      rules: RULES,
      names: { campaign: "Spring Gala", fund: null, appeal: null },
    });
    expect(c.notes).toBe("Follow-on after the gala.");
    expect(c.campaign).toBe("Spring Gala");
    expect(c.recommendation).toMatchObject({ channel: "email", basis: "default", major: false });
    expect(c.sourceLabel).toBe("Entered in BloomOS");
    expect(c.receiptRequired).toBe(false);
  });

  test("do not contact is carried, and no donor at all still renders", () => {
    expect(buildAckContext({ gift: gift(), donor: donor({ do_not_contact: true }), history, rules: RULES, names }).donor.doNotContact).toBe(true);
    const anon = buildAckContext({ gift: gift({ constituent_id: null }), donor: null, history: [{ id: "g6", gift_date: "2026-06-26", amount: 50000 }], rules: RULES, names });
    expect(anon.donor).toMatchObject({ name: "Unnamed donor", email: null, id: null });
  });

  test("source labels", () => {
    expect([sourceLabel("stripe"), sourceLabel("manual"), sourceLabel("something_new")]).toEqual(["Stripe", "Entered in BloomOS", "something_new"]);
  });
});

describe("one row per thank-you", () => {
  const row = (id: string, type: string, rel: string | null = null) => ({ id, type, related_entity_id: rel });
  test("ackTaskLink reads the bridge and escalation labels", () => {
    expect(ackTaskLink(["sys:ack", "sys:gift:g1"])).toEqual({ giftId: "g1", kind: "ack" });
    expect(ackTaskLink(["sys:ack", "sys:escalate:g1"])).toEqual({ giftId: "g1", kind: "escalation" });
    expect(ackTaskLink(["board"])).toBeNull();
    expect(ackTaskLink(null)).toBeNull();
  });

  test("a pending gift's tasks fold into its acknowledgment; other tasks stay", () => {
    const rows = [
      row("acknowledgment:g1", "acknowledgment", "g1"),
      row("ops_task:t-esc", "ops_task"),
      row("ops_task:t-ack", "ops_task"),
      row("ops_task:t-other", "ops_task"),
      row("ops_task:t-thanked", "ops_task"),
    ];
    const tasks = [
      { id: "t-esc", title: "Personally thank Linda Williams for their $1,000 major gift", due_date: "2026-07-01", labels: ["sys:ack", "sys:escalate:g1"] },
      { id: "t-ack", title: "Thank Linda Williams for the $1,000 gift", due_date: "2026-07-02", labels: ["sys:ack", "sys:gift:g1"] },
      { id: "t-other", title: "Send thank you gift to Linda Williams", due_date: "2026-07-02", labels: [] },
      // Its gift is no longer pending (no acknowledgment row): it stays.
      { id: "t-thanked", title: "Personally thank Lynne O'Hara", due_date: "2026-06-27", labels: ["sys:ack", "sys:escalate:g9"] },
    ];
    const { rows: kept, linked } = foldAckTasks(rows, tasks);
    expect(kept.map((r) => r.id)).toEqual(["acknowledgment:g1", "ops_task:t-other", "ops_task:t-thanked"]);
    expect(linked.get("g1")?.map((t) => [t.id, t.kind])).toEqual([
      ["t-esc", "escalation"],
      ["t-ack", "ack"],
    ]);
  });
});

describe("wiring fences", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
  test("the context route fences the active org on every read (via the shared loader)", () => {
    const src = read("app", "api", "admin", "acknowledgments", "context", "route.ts");
    expect(src).toMatch(/getOrgContext\(\)/);
    expect(src).toMatch(/loadAckContext\(createServerSupabase\(\), ctx\.orgId, giftId\)/);
    const loader = read("lib", "admin", "ackContextLoad.ts");
    expect((loader.match(/\.eq\("org_id", orgId\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(src + loader).not.toMatch(/getSupabaseAdmin|SERVICE_ROLE/);
  });
  test("/mark logs any ack channel (email = sent it myself), fenced to the active org, and never sends", () => {
    const src = read("app", "api", "admin", "acknowledgments", "mark", "route.ts");
    expect(src).toMatch(/isAckChannel\(body\?\.channel\)/);
    expect(src).toMatch(/\.eq\("id", giftId\)\s*\/\/[^\n]*\n[^\n]*\n\s*\.eq\("org_id", ctx\.orgId\)/);
    expect(src).not.toMatch(/resend|Resend/);
  });
  test("Mark thanked from the panel carries its channel and the tasks to close", () => {
    const hook = read("app", "admin", "today", "_components", "popout", "useDeferredActions.ts");
    expect(hook).toMatch(/gift_id: row\.source_id, channel: a\.channel/);
    expect(hook).toMatch(/for \(const id of a\.alsoClose \?\? \[\]\)/);
    expect(read("app", "admin", "today", "_components", "popout", "panels.tsx")).toMatch(/acknowledgment: AckPanel/);
  });
});

describe("client bundle fence", () => {
  // The popout is a client component. Importing a module that reaches the
  // stewardship engine (Resend, react-email) breaks the browser build, which
  // typecheck and unit tests don't catch.
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
  const SERVER_ONLY = /from "@\/lib\/(admin\/todayAck|admin\/today|admin\/ackContext|fundraising\/stewardship)"/;
  test.each([
    ["NeedsYou.tsx"],
    ["popout/NeedsYouPopout.tsx"],
    ["popout/AckPanel.tsx"],
    ["popout/AckDraft.tsx"],
    ["popout/OpsTaskPanel.tsx"],
    ["popout/panels.tsx"],
    ["popout/useDeferredActions.ts"],
  ])("%s imports no server-only module except as a type", (file) => {
    const src = read("app", "admin", "today", "_components", ...file.split("/"));
    const valueImports = src.split("\n").filter((l) => l.startsWith("import ") && !l.startsWith("import type "));
    expect(valueImports.filter((l) => SERVER_ONLY.test(l))).toEqual([]);
  });
  test("ackFormat.ts has no imports at all", () => {
    expect(read("lib", "admin", "ackFormat.ts")).not.toMatch(/^import /m);
  });
});
