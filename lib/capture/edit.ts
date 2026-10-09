/**
 * Edit a proposed or held capture card (specs/bloomos-capture.md, C3 step 4).
 *
 * Text fields, destination, assignee, and the entity pick. The new payload is
 * rebuilt with the SAME per-destination rules the parse validator uses
 * (buildDestFields in validate.ts), so an edited card and a parsed card mean
 * the same thing. A pick is always re-verified server-side by id and kind
 * against the caller's org (constituent or partner only; never a prospect,
 * never a student), whether or not it was among the parse-time candidates.
 *
 * Session client only. Reads constituents / partners to verify a pick and
 * memberships / profiles for the staff list; writes only capture_cards.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { constituentName } from "@/lib/fundraising/display";
import { CAPTURE_DEFAULT_TZ, MAX_TRANSCRIPT_CHARS } from "./constants";
import { CARD_COLUMNS, str, type ApplyCtx, type CardRow } from "./apply/shared";
import { loadStaff } from "./staff";
import { CAPTURE_DESTS, type CaptureDest, type StaffMember } from "./types";
import { buildDestFields, type Raw } from "./validate";

export type EditPatch = {
  dest?: unknown;
  notes?: unknown;
  title?: unknown;
  text?: unknown;
  body?: unknown;
  subject?: unknown;
  channel?: unknown;
  kind?: unknown;
  category?: unknown;
  due?: unknown;
  occurred_at?: unknown;
  /** profiles.user_id or handle of a staff member, or null to unassign. */
  assignee?: unknown;
  /** { type: 'constituent' | 'partner', id } to pick, or null to unpick. */
  entity?: unknown;
};

const PATCH_KEYS = new Set([
  "dest",
  "notes",
  "title",
  "text",
  "body",
  "subject",
  "channel",
  "kind",
  "category",
  "due",
  "occurred_at",
  "assignee",
  "entity",
]);

export type EditResult = { ok: true; card: CardRow } | { ok: false; status: 400 | 404 | 409; error: string };

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Shape and size checks before anything touches the database. */
export function checkPatch(patch: unknown): string | null {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return "patch must be an object";
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!PATCH_KEYS.has(k)) return `unknown field: ${k}`;
    if (typeof v === "string" && v.length > MAX_TRANSCRIPT_CHARS) return `${k} is too long`;
  }
  return null;
}

/** Re-verify a pick against the caller's org through RLS. Returns the display name, or null. */
export async function verifyEntity(
  supabase: SupabaseClient,
  orgId: string,
  type: "constituent" | "partner",
  id: string,
): Promise<string | null> {
  if (type === "constituent") {
    const { data } = await supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name")
      .eq("id", id)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle();
    return data ? constituentName(data as Parameters<typeof constituentName>[0]) : null;
  }
  const { data } = await supabase.from("partners").select("id, name").eq("id", id).eq("org_id", orgId).maybeSingle();
  return data ? ((data as { name: string | null }).name?.trim() || "Partner") : null;
}

export async function editCard(
  deps: { supabase: SupabaseClient; ctx: ApplyCtx; now?: () => Date },
  cardId: string,
  rawPatch: unknown,
): Promise<EditResult> {
  const bad = checkPatch(rawPatch);
  if (bad) return { ok: false, status: 400, error: bad };
  const patch = rawPatch as EditPatch;
  const has = (k: keyof EditPatch) => Object.prototype.hasOwnProperty.call(patch, k);
  const { supabase, ctx } = deps;

  const { data: loaded } = await supabase.from("capture_cards").select(CARD_COLUMNS).eq("id", cardId).maybeSingle();
  if (!loaded) return { ok: false, status: 404, error: "Not found" };
  const card = loaded as CardRow;
  if (card.status !== "proposed" && card.status !== "held") {
    return { ok: false, status: 409, error: "Only cards that have not been filed or discarded can be edited." };
  }

  const dest = (has("dest") ? patch.dest : card.dest) as CaptureDest;
  if (!CAPTURE_DESTS.includes(dest)) return { ok: false, status: 400, error: "dest must be interaction, task, thought, or message_draft" };

  // Entity pick / unpick.
  let entityType = card.entity_type;
  let entityId = card.entity_id;
  let name: string | null =
    (typeof card.payload.entity_name === "string" ? card.payload.entity_name : null) ??
    (entityId ? card.match_candidates.find((m) => m.id === entityId)?.name ?? null : null);
  let matchCandidates = card.match_candidates ?? [];
  let picked = false;
  let unpicked = false;
  if (has("entity")) {
    if (patch.entity === null) {
      entityType = null;
      entityId = null;
      name = null;
      unpicked = true;
    } else {
      const e = patch.entity as { type?: unknown; id?: unknown };
      if (e?.type === "prospect") {
        return { ok: false, status: 400, error: "A prospect can't receive a filing. Pick a person or organization on record." };
      }
      if ((e?.type !== "constituent" && e?.type !== "partner") || !isUuid(e?.id)) {
        return { ok: false, status: 400, error: "entity must be { type: 'constituent' | 'partner', id }" };
      }
      const verified = await verifyEntity(supabase, ctx.orgId, e.type, e.id);
      if (!verified) return { ok: false, status: 404, error: "That record is not one you can file to." };
      entityType = e.type;
      entityId = e.id;
      name = verified;
      picked = true;
      if (!matchCandidates.some((m) => m.id === e.id && m.kind === e.type)) {
        matchCandidates = [...matchCandidates, { kind: e.type, id: e.id, name: verified, org_name: null, meta: null }];
      }
    }
  }

  // Assignee -> staff ref, through the same staff list the parse used.
  const staff: StaffMember[] = await loadStaff(supabase, ctx.orgId);
  const staffByRef = new Map(staff.map((s) => [s.ref, s]));
  let assigneeRef: string | null = null;
  if (has("assignee")) {
    if (patch.assignee !== null) {
      const hit = staff.find((s) => s.userId === patch.assignee || s.handle === patch.assignee);
      if (!hit) return { ok: false, status: 400, error: "assignee must be a staff member who can take tasks" };
      assigneeRef = hit.ref;
    }
  } else {
    const prev = card.payload.assignee as { user_id?: unknown } | null | undefined;
    assigneeRef = staff.find((s) => s.userId === prev?.user_id)?.ref ?? null;
  }

  // Raw tool-shaped input, with fallbacks so a destination change keeps the words.
  const prior = (k: string) => str(card.payload[k]);
  const anyText = prior("title") ?? prior("notes") ?? prior("text") ?? prior("body") ?? prior("source_sentence");
  const r: Raw = {
    kind: has("kind") ? patch.kind : card.payload.kind,
    notes: has("notes") ? patch.notes : dest === "interaction" ? prior("notes") ?? anyText : dest === card.dest ? prior("notes") : null,
    occurred_at: has("occurred_at") ? patch.occurred_at : card.payload.occurred_at,
    title: has("title") ? patch.title : prior("title") ?? anyText,
    category: has("category") ? patch.category : card.payload.category,
    due_date: has("due") ? patch.due : card.payload.due_date,
    assignee_ref: assigneeRef,
    text: has("text") ? patch.text : prior("text") ?? anyText,
    channel: has("channel") ? patch.channel : card.payload.channel,
    subject: has("subject") ? patch.subject : card.payload.subject,
    body: has("body") ? patch.body : prior("body") ?? anyText,
  };

  const todayIso = formatInTimeZone(deps.now?.() ?? new Date(), CAPTURE_DEFAULT_TZ, "yyyy-MM-dd");
  const fields = buildDestFields(dest, r, {
    todayIso,
    staffByRef,
    sourceSentence: prior("source_sentence"),
    recipientName: name ?? prior("recipient_name") ?? card.heard_name,
  });
  if (!fields) return { ok: false, status: 400, error: "This card would be empty." };

  const payload: Record<string, unknown> = {};
  for (const keep of ["source_sentence", "org_match", "prospect_name"]) {
    if (card.payload[keep] !== undefined) payload[keep] = card.payload[keep];
  }
  Object.assign(payload, fields);
  if (entityId && name) payload.entity_name = name;

  // An interaction needs a record; an explicit pick or unpick settles any
  // other held card; otherwise a held card stays held.
  const status: CardRow["status"] =
    dest === "interaction" ? (entityId ? "proposed" : "held") : picked || unpicked ? "proposed" : card.status;

  const { data: updated } = await supabase
    .from("capture_cards")
    .update({
      dest,
      status,
      entity_type: entityType,
      entity_id: entityId,
      match_candidates: matchCandidates,
      payload,
    })
    .eq("id", card.id)
    .in("status", ["proposed", "held"])
    .select(CARD_COLUMNS)
    .maybeSingle();
  if (!updated) return { ok: false, status: 409, error: "This card changed while you were editing it." };
  return { ok: true, card: updated as CardRow };
}
