/**
 * Pure display helpers for the Capture confirm stack (specs/bloomos-capture.md,
 * C4). No React, no fetch: everything a card shows is derived here so it can be
 * unit-tested (tests/capture-card-view.test.ts).
 */

import { UNDO_WINDOW_MINUTES } from "@/lib/capture/constants";

export type CardDest = "interaction" | "task" | "thought" | "message_draft";
export type CardStatus = "proposed" | "held" | "confirmed" | "discarded";
export type AppliedTable = "interactions" | "partner_interactions" | "ops_tasks" | "reed_drafts";

export type CandidateView = {
  kind: string;
  id: string;
  name: string;
  org_name?: string | null;
  meta?: string | null;
};

/** A capture_cards row as GET /api/admin/capture/[id] and the card routes return it. */
export type CardView = {
  id: string;
  position: number;
  dest: CardDest;
  status: CardStatus;
  entity_type: "constituent" | "partner" | null;
  entity_id: string | null;
  heard_name: string | null;
  match_confidence: number | null;
  match_candidates: CandidateView[];
  payload: Record<string, unknown>;
  decided_at: string | null;
  applied_table: AppliedTable | null;
  applied_id: string | null;
};

export type CaptureView = {
  id: string;
  status: "parsing" | "ready" | "done" | "failed";
  transcript: string | null;
  created_at: string;
  parse_error: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export const DEST_LABEL: Record<CardDest, string> = {
  interaction: "Interaction",
  task: "Task",
  thought: "Thought",
  message_draft: "Message draft",
};

/** The matched record's display name, if any. */
export function entityName(card: CardView): string | null {
  const fromPayload = str(card.payload.entity_name);
  if (fromPayload) return fromPayload;
  if (!card.entity_id) return null;
  return card.match_candidates.find((m) => m.id === card.entity_id)?.name ?? null;
}

/** The meta line shown under the matched name ("person · last touch Sep 12"). */
export function entityMeta(card: CardView): string | null {
  if (!card.entity_id) return null;
  const hit = card.match_candidates.find((m) => m.id === card.entity_id);
  return hit ? [hit.org_name, hit.meta].filter(Boolean).join(" · ") || null : null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-16" -> "Fri Oct 16". */
export function fmtDay(day: unknown): string | null {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  // Fixed format, not toLocaleDateString: browsers disagree on the comma.
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const firstName = (name: string) => name.split(/\s+/)[0];

/** The card's main words. */
export function cardText(card: CardView): string {
  const p = card.payload;
  if (card.dest === "interaction") return str(p.notes) ?? "";
  if (card.dest === "task") return str(p.title) ?? "";
  if (card.dest === "thought") return str(p.text) ?? "";
  return str(p.body) ?? "";
}

/** One plain line saying what Confirm will do. */
export function whatConfirmDoes(card: CardView): string {
  const p = card.payload;
  const name = entityName(card);
  if (card.dest === "interaction") {
    if (!card.entity_id || !name) return "Pick who this was with to file it.";
    const kind = str(p.kind) ?? "note";
    const day = fmtDay(p.occurred_at);
    const where = card.entity_type === "partner" ? `${name}'s partner record` : `${name}'s record`;
    return `Logs a ${kind} on ${where}${day ? ` for ${day}` : ""}.`;
  }
  if (card.dest === "task") {
    const a = p.assignee as { name?: unknown; handle?: unknown } | null | undefined;
    const who = str(a?.name) ? firstName(str(a?.name) as string) : str(a?.handle) ?? null;
    const due = fmtDay(p.due_date);
    const parts = [`Creates a task${who ? ` for ${who}` : ""}`];
    if (due) parts.push(`due ${due}`);
    if (name) parts.push(`linked to ${name}`);
    return `${parts.join(", ")}.`;
  }
  if (card.dest === "thought") return "Adds it to the parking lot. No due date.";
  const channel = str(p.channel) === "text" ? "text" : "email";
  const to = name ?? str(p.recipient_name) ?? card.heard_name;
  return `Saves a draft ${channel}${to ? ` to ${to}` : ""}. Nothing is sent.`;
}

/** Can this card be confirmed as it stands? */
export function canConfirm(card: CardView): boolean {
  if (card.status !== "proposed") return false;
  if (card.dest === "interaction" && !card.entity_id) return false;
  return true;
}

/** "Which Maria?" for a held card. */
export function heldTitle(card: CardView): string {
  const heard = card.heard_name?.trim();
  return heard ? `Which ${heard}?` : "Who was this with?";
}

/** Held first, then proposed, then filed, then discarded; position order within each. */
export function orderCards(cards: CardView[]): CardView[] {
  const rank: Record<CardStatus, number> = { held: 0, proposed: 1, confirmed: 2, discarded: 3 };
  return [...cards].sort((a, b) => rank[a.status] - rank[b.status] || a.position - b.position);
}

/** Seconds left in the undo window for a confirmed card (0 when closed). */
export function undoSecondsLeft(card: CardView, now: number): number {
  if (card.status !== "confirmed" || !card.decided_at) return 0;
  const end = Date.parse(card.decided_at) + UNDO_WINDOW_MINUTES * 60_000;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/** Where a filed card's row lives, for the "Filed" link. Drafts have no page yet. */
export function filedHref(card: CardView): string | null {
  switch (card.applied_table) {
    case "interactions":
      return card.entity_id ? `/admin/fundraising/donors/${card.entity_id}` : null;
    case "partner_interactions":
      return card.entity_id ? `/admin/partners/${card.entity_id}` : null;
    case "ops_tasks":
      return "/admin/work/tasks";
    default:
      return null;
  }
}

export function filedLabel(card: CardView): string {
  switch (card.applied_table) {
    case "interactions":
    case "partner_interactions":
      return entityName(card) ? `Filed on ${entityName(card)}` : "Filed";
    case "ops_tasks":
      return card.dest === "thought" ? "In the parking lot" : "Task created";
    case "reed_drafts":
      return "Draft saved";
    default:
      return "Filed";
  }
}

export type ConfirmAllResult = {
  results: { id: string; ok: boolean; error?: string }[];
  held_skipped: number;
  already_confirmed: number;
};

/** "Filed 3. 1 still needs a pick." */
export function confirmAllSummary(r: ConfirmAllResult): string {
  const filed = r.results.filter((x) => x.ok).length;
  const failed = r.results.length - filed;
  const parts: string[] = [];
  parts.push(filed === 0 ? "Nothing new to file." : `Filed ${filed}.`);
  if (failed) parts.push(`${failed} couldn't be filed.`);
  if (r.held_skipped) parts.push(`${r.held_skipped} still ${r.held_skipped === 1 ? "needs" : "need"} a pick.`);
  return parts.join(" ");
}

/** Counts for the stack header. */
export function stackCounts(cards: CardView[]) {
  return {
    pending: cards.filter((c) => c.status === "proposed" || c.status === "held").length,
    held: cards.filter((c) => c.status === "held").length,
    proposed: cards.filter((c) => c.status === "proposed").length,
    filed: cards.filter((c) => c.status === "confirmed").length,
  };
}

/** The source sentence the card came from, if the parse kept it. */
export function sourceSentence(card: CardView): string | null {
  return str(card.payload.source_sentence);
}
