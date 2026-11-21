import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * V4 Stage F: undo one import batch. The caller (the undo route) has already
 * checked the role, loaded the run pinned to the active org, and confirmed it
 * is a finished file import. Every query here names BOTH the org and the
 * batch (import_id), so a batch can only ever remove its own rows in its own
 * org, and rows made any other way (import_id null) are never touched.
 *
 * Undo rules:
 *  - Gifts the batch created are removed, except a gift whose thank-you was
 *    already sent (acknowledgment_status 'sent' or an acknowledgments row):
 *    a receipt went to a real person, so it stays and is reported as kept.
 *  - Donors the batch created are removed, except a donor who now has
 *    anything the batch did not make: a gift, a conversation, an ask or a
 *    pledge. Those stay (kept), so later work is never lost. A delete the
 *    database refuses (another table points at the donor) also keeps it.
 *  - Participants the batch created are removed with the cohort enrollments
 *    pointing at them, except a participant with attendance taken, who stays.
 *    Enrollments the import added for people already on the roster stay (the
 *    batch can't tell them from enrollments made before).
 *  - The batch's provenance (external_refs) for removed rows goes too, so
 *    the same file can be imported again later.
 *  - The run is marked 'undone' (who and when). Undo runs once.
 */

export type UndoRun = { id: string; org_id: string; entity_type: string };

export type UndoResult = {
  removed: { gifts: number; donors: number; participants: number };
  kept: { gifts: number; donors: number; participants: number };
};

const CHUNK = 200;

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

async function idsWhere(sb: SupabaseClient, table: string, orgId: string, col: string, ids: string[]): Promise<Set<string>> {
  const hit = new Set<string>();
  for (const part of chunks(ids)) {
    const { data, error } = await sb.from(table).select(col).eq("org_id", orgId).in(col, part);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of (data ?? []) as unknown as Record<string, string>[]) hit.add(r[col]);
  }
  return hit;
}

/** Delete rows by id, pinned to org and batch; per-row on a refusal. Returns removed ids. */
async function deleteBatchRows(sb: SupabaseClient, table: string, run: UndoRun, ids: string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const part of chunks(ids)) {
    const { error } = await sb.from(table).delete().eq("org_id", run.org_id).eq("import_id", run.id).in("id", part);
    if (!error) {
      removed.push(...part);
      continue;
    }
    for (const id of part) {
      const one = await sb.from(table).delete().eq("org_id", run.org_id).eq("import_id", run.id).eq("id", id);
      if (!one.error) removed.push(id);
    }
  }
  return removed;
}

async function batchIds(sb: SupabaseClient, table: string, run: UndoRun, cols = "id"): Promise<Record<string, unknown>[]> {
  const { data, error } = await sb.from(table).select(cols).eq("org_id", run.org_id).eq("import_id", run.id);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

async function dropRefs(sb: SupabaseClient, run: UndoRun, entityType: string, ids: string[]) {
  for (const part of chunks(ids)) {
    await sb.from("external_refs").delete().eq("org_id", run.org_id).eq("source", "csv").eq("entity_type", entityType).in("entity_id", part);
  }
}

export async function undoImportBatch(sb: SupabaseClient, run: UndoRun, actorUserId: string): Promise<UndoResult> {
  const result: UndoResult = { removed: { gifts: 0, donors: 0, participants: 0 }, kept: { gifts: 0, donors: 0, participants: 0 } };

  if (run.entity_type === "gift") {
    const gifts = (await batchIds(sb, "gifts", run, "id, acknowledgment_status")) as { id: string; acknowledgment_status: string | null }[];
    const acked = await idsWhere(sb, "acknowledgments", run.org_id, "gift_id", gifts.map((g) => g.id));
    const keep = gifts.filter((g) => g.acknowledgment_status === "sent" || acked.has(g.id));
    const go = gifts.filter((g) => !keep.includes(g)).map((g) => g.id);
    const removed = await deleteBatchRows(sb, "gifts", run, go);
    await dropRefs(sb, run, "gift", removed);
    result.removed.gifts = removed.length;
    result.kept.gifts = gifts.length - removed.length;
  }

  if (run.entity_type === "gift" || run.entity_type === "constituent") {
    const donors = ((await batchIds(sb, "constituents", run)) as { id: string }[]).map((d) => d.id);
    // Anything pointing at the donor that this batch did not remove keeps it.
    const busy = new Set<string>();
    for (const [table, col] of [["gifts", "constituent_id"], ["interactions", "constituent_id"], ["opportunities", "constituent_id"], ["pledges", "constituent_id"]] as const) {
      for (const id of Array.from(await idsWhere(sb, table, run.org_id, col, donors))) busy.add(id);
    }
    const removed = await deleteBatchRows(sb, "constituents", run, donors.filter((d) => !busy.has(d)));
    await dropRefs(sb, run, "constituent", removed);
    result.removed.donors = removed.length;
    result.kept.donors = donors.length - removed.length;
  }

  if (run.entity_type === "student") {
    const people = ((await batchIds(sb, "students", run)) as { id: string }[]).map((p) => p.id);
    const attended = await idsWhere(sb, "attendance", run.org_id, "student_id", people);
    const go = people.filter((p) => !attended.has(p));
    for (const part of chunks(go)) {
      await sb.from("cohort_members").delete().eq("org_id", run.org_id).in("student_id", part);
    }
    const removed = await deleteBatchRows(sb, "students", run, go);
    await dropRefs(sb, run, "student", removed);
    result.removed.participants = removed.length;
    result.kept.participants = people.length - removed.length;
  }

  const { data: cur } = await sb.from("imports").select("counts").eq("org_id", run.org_id).eq("id", run.id).maybeSingle();
  await sb
    .from("imports")
    .update({
      status: "undone",
      undone_at: new Date().toISOString(),
      undone_by: actorUserId,
      counts: { ...((cur?.counts as Record<string, unknown> | null) ?? {}), undo: result },
    })
    .eq("org_id", run.org_id)
    .eq("id", run.id);
  return result;
}

/** One sentence for the toast and the past-imports list. */
export function undoSentence(r: UndoResult): string {
  const parts: string[] = [];
  if (r.removed.gifts) parts.push(`${r.removed.gifts} ${r.removed.gifts === 1 ? "gift" : "gifts"}`);
  if (r.removed.donors) parts.push(`${r.removed.donors} ${r.removed.donors === 1 ? "donor" : "donors"}`);
  if (r.removed.participants) parts.push(`${r.removed.participants} ${r.removed.participants === 1 ? "person" : "people"}`);
  const head = parts.length ? `Removed ${parts.join(" and ")}.` : "Nothing was left to remove.";
  const kept: string[] = [];
  if (r.kept.gifts) kept.push(`${r.kept.gifts} thanked ${r.kept.gifts === 1 ? "gift" : "gifts"}`);
  if (r.kept.donors) kept.push(`${r.kept.donors} ${r.kept.donors === 1 ? "donor" : "donors"} with newer activity`);
  if (r.kept.participants) kept.push(`${r.kept.participants} ${r.kept.participants === 1 ? "person" : "people"} with attendance`);
  return kept.length ? `${head} Kept ${kept.join(" and ")}.` : head;
}
