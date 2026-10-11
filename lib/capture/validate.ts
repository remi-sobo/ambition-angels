/**
 * Pure validator for the Capture parse output (specs/bloomos-capture.md, C2
 * step 6). The model's tool input is untrusted: every ref is checked against
 * the server-built candidate and staff lists, every date is parsed and
 * windowed, every enum is coerced, and the hold rules decide whether a card is
 * `proposed` or `held` for a human pick. Nothing here touches a database.
 */

import { TASK_CATEGORIES, isTaskCategory } from "@/app/admin/ops/_types/ops";
import { cleanVoiceText } from "@/lib/ai/voice";
import {
  DATE_FUTURE_DAYS,
  DATE_PAST_DAYS,
  MATCH_CONFIDENCE_MIN,
  MAX_CARDS,
  NEAR_TIE_DELTA,
} from "./constants";
import {
  CAPTURE_DESTS,
  DRAFT_CHANNELS,
  INTERACTION_KINDS,
  type Candidate,
  type CaptureDest,
  type DraftChannel,
  type DroppedCard,
  type InteractionKind,
  type MatchCandidateRow,
  type ParseResult,
  type StaffMember,
  type ValidatedCard,
} from "./types";

export type ValidateContext = {
  candidates: Candidate[];
  staff: StaffMember[];
  /** YYYY-MM-DD, the operator's local date. */
  todayIso: string;
};

const MAX_PROSE = 2000;
const MAX_TITLE = 160;
const MAX_SOURCE = 300;

/** An untrusted card in the tool-input shape. */
export type Raw = Record<string, unknown>;

/** Prose fields only: em dashes become pauses, exclamation marks become periods. */
export function cleanProse(s: string, max = MAX_PROSE): string {
  return cleanVoiceText(s)
    .replace(/!+/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysBetween(aIso: string, bIso: string): number {
  const a = ISO_DATE_RE.exec(aIso);
  const b = ISO_DATE_RE.exec(bIso);
  if (!a || !b) return Number.NaN;
  const ad = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const bd = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((bd - ad) / 86_400_000);
}

/** YYYY-MM-DD within [-DATE_PAST_DAYS, +DATE_FUTURE_DAYS] of today, else null. */
export function validDate(v: unknown, todayIso: string): string | null {
  const s = str(v);
  if (!s) return null;
  const m = ISO_DATE_RE.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  const delta = daysBetween(todayIso, s);
  if (Number.isNaN(delta) || delta < -DATE_PAST_DAYS || delta > DATE_FUTURE_DAYS) return null;
  return s;
}

function toRow(c: Candidate): MatchCandidateRow {
  return { kind: c.kind, id: c.id, name: c.name, org_name: c.orgName, meta: c.meta, sim: c.sim };
}

/**
 * Near-tie: among the candidates that answered the same spoken span as the
 * picked one, are the top two within NEAR_TIE_DELTA and is neither the
 * context entity? Returns the top candidates for the span when so.
 */
function nearTie(picked: Candidate, all: Candidate[]): Candidate[] | null {
  if (picked.context) return null;
  const sharesSpan = (c: Candidate) => c.spans.some((s) => picked.spans.includes(s));
  const peers = all.filter((c) => c.kind !== "prospect" && (c.id === picked.id || sharesSpan(c)));
  if (peers.length < 2) return null;
  const sorted = [...peers].sort((a, b) => b.sim - a.sim);
  const [top, second] = sorted;
  if (top.context || second.context) return null;
  if (top.sim - second.sim > NEAR_TIE_DELTA) return null;
  return sorted.slice(0, 3);
}

export type DestFieldsOptions = {
  todayIso: string;
  staffByRef: Map<string, StaffMember>;
  sourceSentence: string | null;
  recipientName: string | null;
};

/**
 * The per-destination payload rules, shared by the parse validator (C2) and
 * the edit action (C3) so a field means the same thing on both paths. `r` is
 * a raw, untrusted object in the tool-input shape (notes, title, text, body,
 * kind, occurred_at, due_date, category, assignee_ref, channel, subject).
 * Returns null when the card would be empty for its destination.
 */
export function buildDestFields(dest: CaptureDest, r: Raw, opts: DestFieldsOptions): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (dest === "interaction") {
    const kindRaw = str(r.kind) as InteractionKind | null;
    const kind: InteractionKind = kindRaw && INTERACTION_KINDS.includes(kindRaw) ? kindRaw : "note";
    const notes = cleanProse(str(r.notes) ?? opts.sourceSentence ?? "");
    if (!notes) return null;
    out.kind = kind;
    out.notes = notes;
    out.occurred_at = validDate(r.occurred_at, opts.todayIso) ?? opts.todayIso;
    return out;
  }
  if (dest === "task") {
    const title = cleanProse(str(r.title) ?? "", MAX_TITLE);
    if (!title) return null;
    const cat = str(r.category);
    out.title = title;
    out.category = isTaskCategory(cat) ? cat : "other";
    out.notes = cleanProse(str(r.notes) ?? "") || null;
    out.due_date = validDate(r.due_date, opts.todayIso);
    const ref = str(r.assignee_ref);
    const assignee = ref ? opts.staffByRef.get(ref) ?? null : null;
    out.assignee = assignee ? { handle: assignee.handle, user_id: assignee.userId, name: assignee.name } : null;
    return out;
  }
  if (dest === "thought") {
    const text = cleanProse(str(r.text) ?? str(r.notes) ?? opts.sourceSentence ?? "");
    if (!text) return null;
    out.text = text;
    out.label = "parking-lot";
    return out;
  }
  const channelRaw = str(r.channel) as DraftChannel | null;
  const channel: DraftChannel = channelRaw && DRAFT_CHANNELS.includes(channelRaw) ? channelRaw : "email";
  const body = cleanProse(str(r.body) ?? "", 4000);
  if (!body) return null;
  out.channel = channel;
  out.subject = channel === "email" ? cleanProse(str(r.subject) ?? "", 140) || null : null;
  out.body = body;
  out.recipient_name = opts.recipientName;
  return out;
}

export function parseCaptureCards(input: unknown, ctx: ValidateContext): ParseResult {
  const dropped: DroppedCard[] = [];
  const cards: ValidatedCard[] = [];
  const root = (input && typeof input === "object" ? input : {}) as Raw;
  const rawCards = Array.isArray(root.cards) ? (root.cards as unknown[]) : [];
  const youthSkipped = Math.max(0, Math.floor(num(root.youth_skipped) ?? 0));

  const byRef = new Map(ctx.candidates.map((c) => [c.ref, c]));
  const staffByRef = new Map(ctx.staff.map((s) => [s.ref, s]));

  rawCards.forEach((rawItem, index) => {
    if (cards.length >= MAX_CARDS) {
      dropped.push({ index, reason: "max_cards" });
      return;
    }
    const r = (rawItem && typeof rawItem === "object" ? rawItem : {}) as Raw;
    let dest = str(r.dest) as CaptureDest | null;
    if (!dest || !CAPTURE_DESTS.includes(dest)) {
      dropped.push({ index, reason: "unknown_dest" });
      return;
    }

    const sourceSentence = cleanProse(str(r.source_sentence) ?? "", MAX_SOURCE) || null;
    const heardName = str(r.heard_name)?.slice(0, 120) ?? null;
    const confidence = num(r.confidence);
    const matchConfidence = confidence === null ? null : Math.max(0, Math.min(1, confidence));

    // Person / org refs: must exist in the candidate list, else unmatched.
    const refStr = str(r.ref);
    const picked = refStr ? byRef.get(refStr) ?? null : null;
    const orgRefStr = str(r.org_ref);
    const orgPicked = orgRefStr ? byRef.get(orgRefStr) ?? null : null;

    let entityType: ValidatedCard["entity_type"] = null;
    let entityId: string | null = null;
    let status: ValidatedCard["status"] = "proposed";
    let matchCandidates: MatchCandidateRow[] = [];
    let effectiveHeard = heardName ?? (refStr && !picked ? refStr : null);

    if (picked && picked.kind !== "prospect") {
      entityType = picked.kind;
      entityId = picked.id;
      const tie = nearTie(picked, ctx.candidates);
      if (tie) {
        status = "held";
        entityType = null;
        entityId = null;
        matchCandidates = tie.map(toRow);
        effectiveHeard = effectiveHeard ?? picked.spans[0] ?? picked.name;
      } else if (matchConfidence !== null && matchConfidence < MATCH_CONFIDENCE_MIN && !picked.context) {
        status = "held";
        entityType = null;
        entityId = null;
        matchCandidates = [toRow(picked)];
        effectiveHeard = effectiveHeard ?? picked.spans[0] ?? picked.name;
      } else {
        matchCandidates = [toRow(picked)];
      }
    }

    // A prospect can never be the entity. An interaction about only a prospect
    // becomes a thought carrying the prospect's name (ruling 3).
    const prospectName = picked?.kind === "prospect" ? picked.name : null;
    if (prospectName && dest === "interaction") {
      dest = "thought";
      r.text = `${prospectName}: ${str(r.notes) ?? sourceSentence ?? ""}`.trim();
    }

    const orgMatch =
      orgPicked && orgPicked.kind !== "prospect" ? { kind: orgPicked.kind, id: orgPicked.id, name: orgPicked.name } : null;

    const payload: Record<string, unknown> = {};
    if (sourceSentence) payload.source_sentence = sourceSentence;
    if (orgMatch) payload.org_match = orgMatch;
    if (prospectName) payload.prospect_name = prospectName;

    const fields = buildDestFields(dest, r, {
      todayIso: ctx.todayIso,
      staffByRef,
      sourceSentence,
      recipientName: picked?.name ?? effectiveHeard ?? null,
    });
    if (!fields) {
      dropped.push({ index, reason: "empty" });
      return;
    }
    Object.assign(payload, fields);
    if (entityId && picked) payload.entity_name = picked.name;
    // An interaction needs a record to land on; without one it waits for a pick.
    if (dest === "interaction" && !entityId) status = "held";

    cards.push({
      position: cards.length + 1,
      dest,
      status,
      entity_type: entityType,
      entity_id: entityId,
      heard_name: effectiveHeard,
      match_confidence: matchConfidence,
      match_candidates: matchCandidates,
      payload,
    });
  });

  return { cards, youthSkipped, dropped };
}

/** Exported for tests and the eval script. */
export const VALID_CATEGORIES = TASK_CATEGORIES;
