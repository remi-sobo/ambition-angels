import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seededRolePermissions } from "./support/roleSeed";
import { canFileCard, filingPermission, filedElsewhere } from "@/lib/capture/cardKind";
import { confirmCard, confirmAll } from "@/lib/capture/confirm";
import { handoffText, handoffUrl, sendToTeammate, HANDOFF_TYPE } from "@/lib/capture/handoff";
import { keepStory, markPledgeAdded, recordGiftFiled } from "@/lib/capture/v4Cards";
import { canFile, cannotFileLine, fileableProposed, filedHref, filedLabel, type CardView } from "@/app/admin/capture/_lib/cardView";
import { MARISOL, OWNER, card, interactionCard, partnerCard, thoughtCard, draftCard, world } from "./support/captureWorld";

/**
 * Voice for every role (approved 2026-11-21): capture.use for all five roles
 * opens Talk to log; filing each card still needs the destination's own
 * permission; a card someone cannot file goes to the org's owners as a note
 * in their team inbox ("Send to a teammate"), never silently dropped.
 */

const FINANCE = "00000000-0000-0000-0000-000000000006";
const ROLES = ["owner", "admin", "staff", "finance", "board_viewer"] as const;
const seed = seededRolePermissions();
const permsOf = (role: string) => seed.filter((r) => r.role === role).map((r) => r.permission);
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

const gift = (over = {}) => card({ dest: "thought", status: "held", entity_type: "constituent", entity_id: MARISOL, payload: { card_kind: "gift", gift_type: "gift", amount: 500 }, ...over });
const pledge = (over = {}) => card({ dest: "thought", status: "held", entity_type: "constituent", entity_id: MARISOL, payload: { card_kind: "gift", gift_type: "pledge", amount: 5000, expected: "December" }, ...over });
const story = (over = {}) => card({ dest: "thought", status: "held", payload: { card_kind: "story", text: "A student found her first job.", identifiable: false }, ...over });

describe("capture.use: the permission", () => {
  test("is in PERMISSIONS (tests/require-permission.test.ts pins the list to the seed)", () => {
    expect(read("lib", "admin", "requirePermission.ts")).toMatch(/^\s*"capture\.use",$/m);
  });

  test("is seeded for all five roles", () => {
    for (const role of ROLES) expect(permsOf(role), role).toContain("capture.use");
  });

  test("the migration moves all eight capture policies onto it, own rows only", () => {
    const sql = read("supabase", "migrations", "capture_use_permission.sql").replace(/--.*$/gm, "");
    const policies = sql.match(/create policy "owner (reads|inserts|updates|deletes) capture(s|_cards)"/g) ?? [];
    expect(policies).toHaveLength(8);
    expect(sql).not.toMatch(/'ops\.(read|write)'/);
    // every using / with check pairs capture.use with created_by = auth.uid()
    const gates = sql.match(/has_permission\(org_id, 'capture\.use'\)\)\s*and created_by = \(select auth\.uid\(\)\)/g) ?? [];
    expect(gates).toHaveLength(10); // per table: select 1 + insert 1 + update 2 + delete 1
    expect(sql.match(/drop policy if exists/g)).toHaveLength(8);
  });
});

describe("canCapture for all five roles", () => {
  const layout = read("app", "admin", "layout.tsx");
  test("the layout's rule is ai.capture + capture.use", () => {
    expect(layout).toMatch(/const canCapture = captureEnabled && !!perms\?\.includes\("capture\.use"\);/);
  });
  test("every role gets Talk to log where the org has ai.capture, and none without it", () => {
    const canCapture = (captureEnabled: boolean, perms: string[]) => captureEnabled && perms.includes("capture.use");
    for (const role of ROLES) {
      expect(canCapture(true, permsOf(role)), role).toBe(true);
      expect(canCapture(false, permsOf(role)), role).toBe(false);
    }
  });
  test("lookup's Record button follows the same rule", () => {
    expect(read("app", "admin", "lookup", "page.tsx")).toMatch(/hasFeature\(ents, "ai\.capture"\) && \(await ctxHasPermission\(ctx, "capture\.use"\)\)/);
  });
});

describe("filing is still gated per destination", () => {
  test("the permission each kind needs", () => {
    expect(filingPermission(interactionCard())).toBe("fundraising.write");
    expect(filingPermission(partnerCard())).toBe("program.write");
    expect(filingPermission(card())).toBe("ops.write");
    expect(filingPermission(thoughtCard())).toBe("ops.write");
    expect(filingPermission(draftCard())).toBe("ops.write");
    expect(filingPermission(gift())).toBe("fundraising.write");
    expect(filingPermission(pledge())).toBe("fundraising.write");
    expect(filingPermission(story())).toBe("ops.write");
  });

  test("by role: owner, admin and staff file everything; finance and board viewers file nothing", () => {
    const all = [interactionCard(), partnerCard(), card(), thoughtCard(), draftCard(), gift(), pledge(), story()];
    for (const role of ["owner", "admin", "staff"]) for (const c of all) expect(canFileCard(c, permsOf(role)), `${role} ${c.dest}`).toBe(true);
    for (const role of ["finance", "board_viewer"]) for (const c of all) expect(canFileCard(c, permsOf(role)), `${role} ${c.dest}`).toBe(false);
  });

  test("confirm refuses a task / conversation / draft without the destination permission, writing nothing", async () => {
    const w = world([card(), interactionCard(), draftCard()], { perms: permsOf("finance") });
    for (const c of w.db.tables.capture_cards as unknown as { id: string }[]) {
      expect(await confirmCard(w.deps, c.id)).toMatchObject({ ok: false, status: 403 });
    }
    expect(w.db.tables.ops_tasks).toHaveLength(0);
    expect(w.db.tables.interactions).toHaveLength(0);
    expect(w.db.tables.reed_drafts).toHaveLength(0);
  });

  test("gift, pledge and story actions ask for their destination's permission too", async () => {
    const g = gift();
    const p = pledge();
    const s = story();
    const w = world([g, p, s], { perms: permsOf("board_viewer") });
    expect(await recordGiftFiled(w.deps, g.id, "aaaaaaaa-0000-4000-8000-000000000001")).toMatchObject({ ok: false, status: 403 });
    expect(await markPledgeAdded(w.deps, p.id)).toMatchObject({ ok: false, status: 403 });
    expect(await keepStory(w.deps, s.id)).toMatchObject({ ok: false, status: 403 });
    expect(w.cardRow(p.id).status).toBe("held");
    expect(w.cardRow(s.id).status).toBe("held");
  });

  test("staff still keeps a story and marks a pledge, as before", async () => {
    const p = pledge();
    const s = story();
    const w = world([p, s], { perms: permsOf("staff") });
    expect((await markPledgeAdded(w.deps, p.id)).ok).toBe(true);
    expect((await keepStory(w.deps, s.id)).ok).toBe(true);
  });
});

describe("Send to a teammate", () => {
  const financeWorld = (cards: ReturnType<typeof card>[]) => {
    const w = world(
      cards.map((c) => ({ ...c, created_by: FINANCE })),
      { perms: permsOf("finance"), userId: FINANCE },
    );
    w.db.tables.captures[0].created_by = FINANCE; // the finance member's own recording
    const notify = vi.fn(async (n: Record<string, unknown>) => ({ id: `n-${notify.mock.calls.length}-${String(n.recipientId)}` }));
    w.deps.notify = notify as never;
    w.deps.ctx.handle = "Fran";
    return { w, notify };
  };

  test("files an unfileable card as a note in the org owner's team inbox", async () => {
    const c = interactionCard();
    const { w, notify } = financeWorld([c]);
    const r = await sendToTeammate(w.deps, c.id);
    expect(r.ok).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    const n = notify.mock.calls[0][0];
    expect(n).toMatchObject({ recipientId: OWNER, actorId: FINANCE, type: HANDOFF_TYPE, linkedEntityType: "constituent", linkedEntityId: MARISOL });
    expect(n.title).toBe("Fran sent you a donor conversation to file");
    expect(String(n.body)).toContain("Marisol");
    const row = w.cardRow(c.id);
    expect(row.status).toBe("confirmed");
    expect(row.applied_id).toBeNull();
    expect(filedElsewhere(row.payload)).toMatchObject({ table: "notifications", handoff: true, to: [OWNER], toNames: ["Remi Sobomehin"] });
    // Nothing reached a destination table.
    expect(w.db.tables.interactions).toHaveLength(0);
    expect(w.captureStatus()).toBe("done");
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.card.handoff", entityId: c.id }));
  });

  test("works for gift and story cards (held by design) and for a held card that needs a pick", async () => {
    const g = gift();
    const s = story();
    const h = interactionCard({ status: "held", entity_type: null, entity_id: null, heard_name: "Maria" });
    const { w, notify } = financeWorld([g, s, h]);
    for (const c of [g, s, h]) expect((await sendToTeammate(w.deps, c.id)).ok).toBe(true);
    expect(notify).toHaveBeenCalledTimes(3);
    expect(String(notify.mock.calls[0][0].body)).toContain("Gift: $500");
  });

  test("a double tap sends once", async () => {
    const c = card();
    const { w, notify } = financeWorld([c]);
    await sendToTeammate(w.deps, c.id);
    expect(await sendToTeammate(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test("a sent card is never re-filed by confirm's crash recovery or Confirm all", async () => {
    const c = card();
    const { w } = financeWorld([c]);
    await sendToTeammate(w.deps, c.id);
    w.advance(10 * 60_000);
    w.perms.add("ops.write"); // even if the role later gains the permission
    expect((await confirmCard(w.deps, c.id)).ok).toBe(true);
    expect(w.db.tables.ops_tasks).toHaveLength(0);
    const all = await confirmAll(w.deps, c.capture_id);
    expect(all).toMatchObject({ ok: true, already_confirmed: 1, results: [] });
    expect(w.db.tables.ops_tasks).toHaveLength(0);
  });

  test("a card the caller CAN file is refused: Confirm it", async () => {
    const c = card();
    const w = world([c], { perms: permsOf("staff") });
    const notify = vi.fn(async () => ({ id: "n" }));
    w.deps.notify = notify;
    expect(await sendToTeammate(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
    expect(notify).not.toHaveBeenCalled();
  });

  test("if no note lands, the card goes back to how it was", async () => {
    const c = card();
    const { w, notify } = financeWorld([c]);
    notify.mockImplementation(async () => null as never);
    expect(await sendToTeammate(w.deps, c.id)).toMatchObject({ ok: false, status: 500 });
    expect(w.cardRow(c.id).status).toBe("proposed");
    expect(filedElsewhere(w.cardRow(c.id).payload)).toBeNull();
  });

  test("never sends to the sender; with no owner, admins; with neither, 409", async () => {
    const c = card();
    const { w, notify } = financeWorld([c]);
    w.db.tables.memberships = [
      { user_id: FINANCE, org_id: w.deps.ctx.orgId, role: "finance" },
      { user_id: "00000000-0000-0000-0000-0000000000ad", org_id: w.deps.ctx.orgId, role: "admin" },
    ];
    expect((await sendToTeammate(w.deps, c.id)).ok).toBe(true);
    expect(notify.mock.calls[0][0].recipientId).toBe("00000000-0000-0000-0000-0000000000ad");

    const d = card();
    const second = financeWorld([d]);
    second.w.db.tables.memberships = [{ user_id: FINANCE, org_id: second.w.deps.ctx.orgId, role: "finance" }];
    expect(await sendToTeammate(second.w.deps, d.id)).toMatchObject({ ok: false, status: 409 });
  });

  test("another member's card is a 404 (captures stay personal)", async () => {
    const c = card({ created_by: OWNER });
    const w = world([c], { perms: [], userId: FINANCE });
    w.deps.notify = vi.fn(async () => ({ id: "n" }));
    expect(await sendToTeammate(w.deps, c.id)).toMatchObject({ ok: false, status: 404 });
  });

  test("the note's words and link, kind by kind", () => {
    expect(handoffText(card())).toContain("Send the one-pager");
    expect(handoffText(pledge())).toContain("Pledge: $5,000, expected December");
    expect(handoffText(story({ payload: { card_kind: "story", text: "Jaylen M. got the job.", identifiable: true } }))).toContain("hold until consent");
    expect(handoffUrl(interactionCard())).toBe(`/admin/fundraising/donors-funders/${MARISOL}`);
    expect(handoffUrl(card())).toBeNull();
  });

  test("the route takes send_to_teammate, gated on ai.capture", () => {
    const route = read("app", "api", "admin", "capture", "cards", "[id]", "route.ts");
    expect(route).toMatch(/"send_to_teammate"/);
    expect(route).toMatch(/await sendToTeammate\(await actionDeps\(req, ent\.ctx\), params\.id\)/);
  });
});

describe("the stack shows it plainly", () => {
  const view = (c: ReturnType<typeof card>) => c as unknown as CardView;
  test("canFile follows the reported filing permissions", () => {
    expect(canFile(view(card()), [])).toBe(false);
    expect(canFile(view(card()), ["ops.write"])).toBe(true);
    expect(canFile(view(card()), undefined)).toBe(true); // not told: Stage C behavior
  });
  test("Confirm all counts only what the person can file", () => {
    const cards = [card(), interactionCard(), card({ status: "confirmed" })].map(view);
    expect(fileableProposed(cards, ["ops.write"])).toBe(1);
    expect(fileableProposed(cards, [])).toBe(0);
  });
  test("plain words, then where it went", () => {
    expect(cannotFileLine(view(interactionCard()))).toMatch(/can't log on donor records/);
    expect(cannotFileLine(view(gift()))).toMatch(/can't record gifts/);
    const sent = view(card({ status: "confirmed", payload: { filed: { table: "notifications", handoff: true, to: [OWNER], to_names: ["Remi Sobomehin"] } } }));
    expect(filedLabel(sent)).toBe("Sent to Remi to file");
    expect(filedHref(sent)).toBeNull();
  });
  test("ConfirmStack swaps Confirm for Send to a teammate on a card the person cannot file", () => {
    const src = read("app", "admin", "capture", "_components", "ConfirmStack.tsx");
    expect(src).toMatch(/!filed && !fileableHere \? \(\s*<CannotFile/);
    expect(src).toMatch(/\{!held && fileableHere && \(/);
    expect(src).toMatch(/"Send to a teammate"/);
    expect(src).toMatch(/actions=\{fileableHere\}/);
  });
});

describe("voice on for SafeSpace and Young Life EPA", () => {
  const sql = read("supabase", "migrations", "seed_capture_safespace_ylepa.sql").replace(/--.*$/gm, "");
  test("enables ai.capture for exactly those two slugs", () => {
    expect(sql).toMatch(/'ai\.capture', true/);
    expect(sql).toMatch(/where o\.slug in \('safespace', 'young-life-epa'\)/);
  });
  test("idempotent: the same upsert as the original ai.capture seed", () => {
    expect(sql).toMatch(/on conflict \(org_id, feature_key\)\s*do update set enabled = true, source = excluded\.source, updated_at = now\(\);/);
    expect(read("supabase", "migrations", "capture_use_permission.sql").replace(/--.*$/gm, "")).toMatch(/\) on conflict do nothing;|\)\s*on conflict do nothing;/);
  });
  test("all three migrations are in the RLS run, after the tables they touch", () => {
    const sh = read("scripts", "test-rls.sh");
    const at = (f: string) => sh.indexOf(`  ${f}\n`);
    for (const f of ["add_owner_id_opportunities.sql", "capture_use_permission.sql", "seed_capture_safespace_ylepa.sql"]) expect(at(f), f).toBeGreaterThan(0);
    expect(at("capture_tables.sql")).toBeLessThan(at("capture_use_permission.sql"));
    expect(at("capture_use_permission.sql")).toBeLessThan(at("seed_capture_safespace_ylepa.sql"));
    expect(at("create_opportunities.sql")).toBeLessThan(at("add_owner_id_opportunities.sql"));
  });
});
