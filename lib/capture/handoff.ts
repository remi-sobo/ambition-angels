/**
 * "Send to a teammate": voice for every role (approved 2026-11-21).
 *
 * Every role can record now (capture.use), but filing a card still needs the
 * destination's own permission (filingPermission in cardKind.ts). A finance
 * member or a board viewer usually cannot file what they said, so instead of
 * dropping it the card is SENT to the org's owners as a note in their team
 * inbox (the notifications spine, /admin/inbox). Why the inbox and not a task
 * assigned to an owner: creating an ops_task needs ops.write, which is exactly
 * what these roles lack, and the notifications spine is the one existing write
 * path that reaches a teammate from any role (lib/notifications/notify.ts).
 *
 * Rules:
 *  - only the caller's own card (RLS: capture_cards are personal), proposed or
 *    held, and only one the caller CANNOT file (409 otherwise: Confirm it);
 *  - recipients: the active org's owners, else its admins, never the sender;
 *  - claim first (proposed/held -> confirmed, payload.filed = the handoff), so
 *    a double tap sends once; if no notification lands, the claim is undone;
 *  - the note carries the card's words, so the owner can act on it without
 *    seeing the sender's private recording (captures stay personal).
 *
 * Reads memberships and profiles through the session client; writes only
 * capture_cards. The notification itself goes through deps.notify.
 */

import { KIND_LABEL, canFileCard, cardKindOf, FILING_PERMISSIONS } from "./cardKind";
import { CARD_COLUMNS, entityName, str, type CardRow } from "./apply/shared";
import { settleCapture, type ActionDeps, type ActionResult } from "./confirm";

const fail = (status: number, error: string, card?: CardRow): ActionResult => ({ ok: false, status, error, card });

export const HANDOFF_TYPE = "capture.handoff";

/** The card's words for the note, kind by kind. Pure. */
export function handoffText(card: Pick<CardRow, "dest" | "payload" | "heard_name" | "entity_id" | "match_candidates">): string {
  const p = card.payload ?? {};
  const kind = cardKindOf(card);
  const who = entityName(card as CardRow) ?? card.heard_name ?? null;
  const lines: string[] = [];
  if (who) lines.push(`About: ${who}`);
  switch (kind) {
    case "conversation":
      if (str(p.kind)) lines.push(`Kind: ${str(p.kind)}`);
      if (str(p.occurred_at)) lines.push(`When: ${str(p.occurred_at)}`);
      if (str(p.notes)) lines.push(str(p.notes)!);
      break;
    case "todo":
      if (str(p.title)) lines.push(str(p.title)!);
      if (str(p.due_date)) lines.push(`Due: ${str(p.due_date)}`);
      if (str(p.notes)) lines.push(str(p.notes)!);
      break;
    case "note":
      if (str(p.text)) lines.push(str(p.text)!);
      break;
    case "draft":
      if (str(p.body)) lines.push(str(p.body)!);
      break;
    case "gift": {
      const amount = typeof p.amount === "number" ? `$${p.amount.toLocaleString("en-US")}` : str(p.amount_heard) ?? "amount not heard";
      lines.push(p.gift_type === "pledge" ? `Pledge: ${amount}${str(p.expected) ? `, expected ${str(p.expected)}` : ""}` : `Gift: ${amount}${str(p.gift_date) ? `, ${str(p.gift_date)}` : ""}`);
      if (str(p.notes)) lines.push(str(p.notes)!);
      break;
    }
    case "story":
      if (str(p.title)) lines.push(str(p.title)!);
      if (str(p.text)) lines.push(str(p.text)!);
      if (p.identifiable !== false) lines.push("Names or points to a participant: hold until consent is on file.");
      break;
  }
  if (lines.length === (who ? 1 : 0) && str(p.source_sentence)) lines.push(`"${str(p.source_sentence)}"`);
  return lines.join("\n").slice(0, 2000);
}

/** Where the note links: the record the card is about, when it has one. */
export function handoffUrl(card: Pick<CardRow, "entity_type" | "entity_id">): string | null {
  if (!card.entity_id) return null;
  if (card.entity_type === "constituent") return `/admin/fundraising/donors-funders/${card.entity_id}`;
  if (card.entity_type === "partner") return `/admin/partners/${card.entity_id}`;
  return null;
}

type Member = { user_id: string; role: string | null };

/** The org's owners (else its admins), never the sender, with display names. */
export async function handoffRecipients(deps: ActionDeps): Promise<{ id: string; name: string }[]> {
  const { data } = await deps.supabase
    .from("memberships")
    .select("user_id, role")
    .eq("org_id", deps.ctx.orgId)
    .in("role", ["owner", "admin"]);
  const rows = ((data ?? []) as Member[]).filter((m) => m.user_id !== deps.ctx.userId);
  const owners = rows.filter((m) => m.role === "owner");
  const chosen = owners.length > 0 ? owners : rows.filter((m) => m.role === "admin");
  if (chosen.length === 0) return [];
  const { data: profiles } = await deps.supabase
    .from("profiles")
    .select("user_id, display_name")
    .in(
      "user_id",
      chosen.map((m) => m.user_id),
    );
  const names = new Map(((profiles ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [p.user_id, p.display_name?.trim() || ""]));
  return chosen.map((m) => ({ id: m.user_id, name: names.get(m.user_id) || (m.role === "owner" ? "Owner" : "Admin") }));
}

/** The filing permissions the caller holds, for the client (canFileCard). */
export async function filingPermissionsHeld(hasPermission: (p: string) => Promise<boolean>): Promise<string[]> {
  const held: (string | null)[] = await Promise.all(FILING_PERMISSIONS.map(async (p) => ((await hasPermission(p)) ? p : null)));
  return held.filter((p): p is string => !!p);
}

export async function sendToTeammate(deps: ActionDeps, cardId: string): Promise<ActionResult> {
  const { data } = await deps.supabase.from("capture_cards").select(CARD_COLUMNS).eq("id", cardId).maybeSingle();
  const card = (data as CardRow | null) ?? null;
  if (!card) return fail(404, "Not found");
  if (card.status === "confirmed") return fail(409, "This card was already handled.", card);
  if (card.status === "discarded") return fail(409, "This card was discarded.", card);
  if (canFileCard(card, await filingPermissionsHeld(deps.hasPermission))) {
    return fail(409, "You can file this one yourself. Use Confirm.", card);
  }
  if (!deps.notify) return fail(500, "Sending to a teammate isn't set up on this server.", card);

  const recipients = await handoffRecipients(deps);
  if (recipients.length === 0) return fail(409, "There's no owner in this organization to send it to.", card);

  const now = (deps.now?.() ?? new Date()).toISOString();
  const before = { status: card.status, payload: card.payload };
  const filed = { table: "notifications", handoff: true, to: recipients.map((r) => r.id), to_names: recipients.map((r) => r.name) };

  // Claim: a second tap finds it confirmed and sends nothing.
  const { data: claimed } = await deps.supabase
    .from("capture_cards")
    .update({ status: "confirmed", decided_by: deps.ctx.userId, decided_at: now, payload: { ...card.payload, filed } })
    .eq("id", card.id)
    .in("status", ["proposed", "held"])
    .select(CARD_COLUMNS)
    .maybeSingle();
  if (!claimed) return fail(409, "This card changed while you were sending it.");

  const label = KIND_LABEL[cardKindOf(card)].toLowerCase();
  const sent: string[] = [];
  for (const r of recipients) {
    const row = await deps.notify({
      orgId: deps.ctx.orgId,
      recipientId: r.id,
      actorId: deps.ctx.userId,
      type: HANDOFF_TYPE,
      title: `${deps.ctx.handle} sent you a ${label} to file`,
      body: handoffText(card),
      linkedEntityType: card.entity_id ? card.entity_type : null,
      linkedEntityId: card.entity_id,
      linkedLabel: entityName(card),
      url: handoffUrl(card),
    });
    if (row) sent.push(r.id);
  }

  if (sent.length === 0) {
    await deps.supabase
      .from("capture_cards")
      .update({ status: before.status, decided_by: null, decided_at: null, payload: before.payload })
      .eq("id", card.id)
      .eq("status", "confirmed");
    return fail(500, "It couldn't be sent. Your card is still here; try again.", card);
  }

  await deps.ctx.audit({
    action: "capture.card.handoff",
    entityType: "capture_cards",
    entityId: card.id,
    after: { to: sent, kind: cardKindOf(card) },
  });
  await settleCapture(deps.supabase, card.capture_id);
  return { ok: true, card: claimed as CardRow };
}
