import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Epic M1 — merge a duplicate constituent into a primary. All child records
// (gifts, opportunities, grants, interactions, pledges, recurring plans, soft
// credits, comms ledger, relationships) are reassigned to the primary, the two
// records' contact fields are unioned, then the duplicate is deleted. Merges
// are destructive + hard to undo, so it's auth-gated and fully audited.

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));

// Tables that carry the donor by constituent_id and should follow the merge.
const CHILD_TABLES = [
  "gifts", "opportunities", "interactions", "pledges",
  "recurring_plans", "soft_credits", "email_sends",
] as const;

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const primaryId = body.primary_id;
  const duplicateId = body.duplicate_id;
  if (!isUuid(primaryId) || !isUuid(duplicateId)) {
    return NextResponse.json({ error: "primary_id and duplicate_id are required" }, { status: 400 });
  }
  if (primaryId === duplicateId) {
    return NextResponse.json({ error: "Cannot merge a record into itself" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: rows } = await supabase
    .from("constituents")
    .select("id, first_name, last_name, org_name, emails, phones, tags, external_ids, notes, household_id")
    .in("id", [primaryId, duplicateId]);
  const primary = (rows ?? []).find((r) => r.id === primaryId);
  const duplicate = (rows ?? []).find((r) => r.id === duplicateId);
  if (!primary || !duplicate) return NextResponse.json({ error: "Both constituents must exist" }, { status: 404 });

  // 0) Gift-table placements go FIRST, and they are not a plain reassign.
  //
  //    fr_gift_table_placements.constituent_id is ON DELETE RESTRICT, so if
  //    this route ever forgot them the final delete would fail — loudly, but
  //    only after every other child table had already been reassigned, and
  //    this route has no transaction. Handling them before anything else
  //    means a failure here aborts while nothing has moved.
  //
  //    A straight UPDATE is not enough either: one placement per household
  //    (or per unhouseholded person) per table is enforced by partial unique
  //    indexes, so if BOTH constituents are placed on the same gift table the
  //    reassign collides. The primary's placement wins and the duplicate's is
  //    marked removed with a note naming the merge — the journey_enrollments
  //    precedent, except the row is kept rather than deleted, because a
  //    placement carries scores, a warm path and a why-note that someone
  //    wrote down.
  const { data: dupPlacements } = await supabase
    .from("fr_gift_table_placements")
    .select("id, gift_table_id")
    .eq("constituent_id", duplicateId);
  if (dupPlacements && dupPlacements.length > 0) {
    const tableIds = dupPlacements.map((p) => p.gift_table_id as string);
    const { data: primaryPlacements } = await supabase
      .from("fr_gift_table_placements")
      .select("gift_table_id")
      .eq("constituent_id", primaryId)
      .in("gift_table_id", tableIds)
      .neq("status", "removed");
    const taken = new Set((primaryPlacements ?? []).map((p) => p.gift_table_id as string));

    const markRemoved = (id: string) =>
      supabase
        .from("fr_gift_table_placements")
        .update({
          constituent_id: primaryId,
          status: "removed",
          why_note: `Removed by a constituent merge into ${primaryId}. The surviving record already held this table's slot.`,
        })
        .eq("id", id);

    for (const p of dupPlacements) {
      const id = p.id as string;
      let collides = taken.has(p.gift_table_id as string);
      let { error } = collides
        ? await markRemoved(id)
        : await supabase
            .from("fr_gift_table_placements")
            .update({ constituent_id: primaryId })
            .eq("id", id);

      // The slot can also be held by a THIRD member of the primary's
      // household: household_id is re-derived by trigger on this very update,
      // so the collision only becomes visible when the partial unique index
      // rejects it. Treat the index as the authority rather than trying to
      // predict every shape.
      if (error?.code === "23505" && !collides) {
        collides = true;
        ({ error } = await markRemoved(id));
      }
      if (error) {
        console.error("[merge] gift table placement reassign failed:", error.message);
        return NextResponse.json(
          { error: "Failed reassigning gift table placements; nothing was changed." },
          { status: 500 },
        );
      }
      await audit(req, {
        action: collides
          ? "fundraising.gift_table_placement.merged_removed"
          : "fundraising.gift_table_placement.merged",
        entityType: "fr_gift_table_placement",
        entityId: p.id as string,
        before: { constituent_id: duplicateId },
        after: { constituent_id: primaryId, ...(collides ? { status: "removed" } : {}) },
      });
    }
  }

  // 1) Reassign child records by constituent_id. Abort before deleting if any
  //    reassignment fails, so a partial merge can't strand the donor link.
  for (const table of CHILD_TABLES) {
    const { error } = await supabase.from(table).update({ constituent_id: primaryId }).eq("constituent_id", duplicateId);
    if (error) {
      console.error(`[merge] ${table} reassign failed:`, error.message);
      return NextResponse.json({ error: `Failed reassigning ${table}; nothing was deleted.` }, { status: 500 });
    }
  }
  // Grants reference the donor as funder_id; relationships via a_id/b_id.
  await supabase.from("grants").update({ funder_id: primaryId }).eq("funder_id", duplicateId);
  await supabase.from("relationships").update({ a_id: primaryId }).eq("a_id", duplicateId);
  await supabase.from("relationships").update({ b_id: primaryId }).eq("b_id", duplicateId);
  // Journey enrollments are unique per (journey, constituent); just drop the
  // duplicate's rather than risk a unique collision on reassign.
  await supabase.from("journey_enrollments").delete().eq("constituent_id", duplicateId);

  // 2) Union the contact fields onto the primary (primary wins on names).
  const pExt = (primary.external_ids ?? {}) as Record<string, unknown>;
  const dExt = (duplicate.external_ids ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {
    emails: uniq([...(primary.emails ?? []), ...(duplicate.emails ?? [])]),
    phones: uniq([...(primary.phones ?? []), ...(duplicate.phones ?? [])]),
    tags: uniq([...(primary.tags ?? []), ...(duplicate.tags ?? [])]),
    external_ids: { ...dExt, ...pExt }, // primary wins, duplicate fills gaps
  };
  if (!primary.first_name && duplicate.first_name) update.first_name = duplicate.first_name;
  if (!primary.last_name && duplicate.last_name) update.last_name = duplicate.last_name;
  if (!primary.org_name && duplicate.org_name) update.org_name = duplicate.org_name;
  if (!primary.household_id && duplicate.household_id) update.household_id = duplicate.household_id;
  const notes = [primary.notes, duplicate.notes].filter(Boolean).join("\n\n");
  if (notes) update.notes = notes;

  const { error: upErr } = await supabase.from("constituents").update(update).eq("id", primaryId);
  if (upErr) return NextResponse.json({ error: `Merge fields failed: ${upErr.message}` }, { status: 500 });

  // 3) Remove the now-empty duplicate.
  const { error: delErr } = await supabase.from("constituents").delete().eq("id", duplicateId);
  if (delErr) return NextResponse.json({ error: `Could not delete duplicate: ${delErr.message}` }, { status: 500 });

  await audit(req, {
    action: "fundraising.constituent.merge",
    entityType: "constituents",
    entityId: primaryId,
    before: { duplicate_id: duplicateId, duplicate },
    after: update,
  });
  return NextResponse.json({ ok: true });
}
