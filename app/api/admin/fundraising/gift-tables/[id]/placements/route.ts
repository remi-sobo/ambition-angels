import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { resolveConstituent } from "@/lib/fundraising/constituent-resolve";

/**
 * Placements on a gift table (specs/fundraising-gift-tables.md, Phase 3).
 *
 * A placement is the product. The pyramid is quick; this is the part that
 * says who is really at each level, how warm the path to them is, and what
 * happens next.
 *
 * Three rules live here rather than in the UI, because a rule enforced only
 * in a form is a rule that a second caller breaks:
 *
 *  - DO NOT CONTACT blocks a NEW placement outright. An existing placement
 *    whose donor later turns DNC is left alone: the money stays counted and
 *    the badge appears at read time. Contact stopped; the gift did not.
 *  - HOUSEHOLD-FIRST is enforced by partial unique indexes, so the 23505 this
 *    route translates is the database's answer, not a guess. The message
 *    names who already holds the slot.
 *  - REMOVE IS SOFT. A placement carries four scores, a warm path and a
 *    why-note that somebody sat and wrote. Removing it releases the level's
 *    slot (the unique indexes exclude `removed`) without throwing that away.
 */

const SCORES = ["capacity_score", "affinity_score", "connection_score", "readiness_score"] as const;
const STATUSES = ["prospect", "cultivating", "ready", "declined", "removed"] as const;
const CADENCES = ["one_time", "annual", "monthly"] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

type Fields = Record<string, unknown>;

function placementFields(body: Fields): { fields: Fields } | { error: string } {
  const out: Fields = {};

  if (typeof body.level_id === "string") out.level_id = body.level_id;

  if (body.target_amount !== undefined) {
    if (body.target_amount === null) out.target_amount = null;
    else if (typeof body.target_amount !== "number" || body.target_amount < 0) {
      return { error: "Target must be zero or more" };
    } else out.target_amount = Math.round(body.target_amount * 100) / 100;
  }

  if (body.cadence !== undefined) {
    if (body.cadence === null) out.cadence = null;
    else if (!CADENCES.includes(body.cadence as (typeof CADENCES)[number])) {
      return { error: "Unknown cadence" };
    } else out.cadence = body.cadence;
  }
  if (body.term_years !== undefined) {
    if (body.term_years === null) out.term_years = null;
    else {
      const t = body.term_years;
      if (typeof t !== "number" || !Number.isInteger(t) || t < 1 || t > 20) {
        return { error: "Term must be a whole number of years between 1 and 20" };
      }
      out.term_years = t;
    }
  }

  for (const key of SCORES) {
    if (body[key] === undefined) continue;
    if (body[key] === null) {
      out[key] = null;
      continue;
    }
    const v = body[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) {
      return { error: "Scores run from 1 to 5" };
    }
    out[key] = v;
  }

  for (const key of ["warm_path", "why_note", "next_step"] as const) {
    if (typeof body[key] === "string") {
      out[key] = (body[key] as string).trim().slice(0, 2000) || null;
    }
  }
  if (body.next_step_due !== undefined) {
    if (body.next_step_due === null || body.next_step_due === "") out.next_step_due = null;
    else if (!isISODate(body.next_step_due)) return { error: "Next step date must be a date" };
    else out.next_step_due = body.next_step_due;
  }
  if (body.owner !== undefined) {
    out.owner =
      typeof body.owner === "string" && body.owner.trim() ? body.owner.trim().slice(0, 80) : null;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
      return { error: "Unknown status" };
    }
    out.status = body.status;
  }

  return { fields: out };
}

/** The gift table, checked against the session org. Everything else hangs
 *  off its org_id rather than the caller's word. */
async function loadTable(supabase: ReturnType<typeof createServerSupabase>, id: string, orgId: string) {
  const { data } = await supabase
    .from("fr_gift_tables")
    .select("id, org_id, status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  return data;
}

/** Translate the partial unique indexes into a sentence that names the
 *  household or person already holding the slot. */
async function slotHolder(
  supabase: ReturnType<typeof createServerSupabase>,
  tableId: string,
  constituentId: string,
): Promise<string> {
  const { data: con } = await supabase
    .from("constituents")
    .select("household_id")
    .eq("id", constituentId)
    .maybeSingle();
  const householdId = (con?.household_id as string | null) ?? null;
  const q = supabase
    .from("fr_gift_table_placements")
    .select("id, constituent:constituents ( first_name, last_name, org_name )")
    .eq("gift_table_id", tableId)
    .neq("status", "removed")
    .limit(1);
  const { data } = householdId
    ? await q.eq("household_id", householdId)
    : await q.eq("constituent_id", constituentId);
  const row = (data ?? [])[0] as { constituent?: { first_name?: string; last_name?: string; org_name?: string } } | undefined;
  const c = row?.constituent;
  const name =
    c?.org_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "someone";
  return householdId
    ? `${name} is already placed on this table, and they share a household. A household takes one slot.`
    : `${name} is already placed on this table.`;
}

/** POST — place a name. Accepts a constituent, or a bench prospect that has
 *  no constituent yet (resolved, never promoted: placing is not asking). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Fields | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = placementFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { fields } = parsed;
  if (typeof fields.level_id !== "string") {
    return NextResponse.json({ error: "Pick a level" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const table = await loadTable(supabase, params.id, ctx.orgId);
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });
  if (table.status === "closed" || table.status === "archived") {
    return NextResponse.json({ error: "A closed table's placements are frozen" }, { status: 409 });
  }

  // A bench row with no constituent gets one made for it. Deliberately NOT
  // the promote route: that also opens an opportunity and flips the row to
  // promoted, and placing a name is not the same as asking them for money.
  let constituentId = typeof body.constituent_id === "string" ? body.constituent_id : null;
  let benchLinked: string | null = null;
  if (!constituentId && typeof body.prospect_id === "string") {
    const { data: bench } = await supabase
      .from("fr_prospects")
      .select("id, name, constituent_id")
      .eq("id", body.prospect_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!bench) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    if (bench.constituent_id) {
      constituentId = bench.constituent_id as string;
    } else {
      const resolved = await resolveConstituent(supabase, ctx.orgId, { name: bench.name });
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      constituentId = resolved.constituentId;
      await supabase
        .from("fr_prospects")
        .update({ constituent_id: constituentId })
        .eq("id", bench.id)
        .eq("org_id", ctx.orgId);
      benchLinked = bench.id as string;
      await audit(req, {
        action: "fundraising.prospect.link_constituent",
        entityType: "fr_prospect",
        entityId: bench.id as string,
        before: { constituent_id: null },
        after: { constituent_id: constituentId },
      });
    }
  }
  if (!constituentId) {
    return NextResponse.json({ error: "Pick someone to place" }, { status: 400 });
  }

  // Do not contact blocks a NEW placement. The check is here and not only in
  // the form because every write path has to honour it.
  const { data: con } = await supabase
    .from("constituents")
    .select("id, do_not_contact")
    .eq("id", constituentId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!con) return NextResponse.json({ error: "Constituent not found" }, { status: 404 });
  if (con.do_not_contact === true) {
    return NextResponse.json(
      { error: "This donor is marked do not contact, so they can't be placed on a table." },
      { status: 409 },
    );
  }

  const { data: row, error } = await supabase
    .from("fr_gift_table_placements")
    .insert({
      ...fields,
      gift_table_id: table.id,
      org_id: table.org_id,
      constituent_id: constituentId,
      // household_id is set by trigger from the constituent. Never sent.
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: await slotHolder(supabase, table.id, constituentId) },
        { status: 409 },
      );
    }
    console.error("Place on gift table failed:", error.message);
    return NextResponse.json({ error: "Could not place that name" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.gift_table_placement.create",
    entityType: "fr_gift_table_placement",
    entityId: row.id,
    after: { ...fields, gift_table_id: table.id, constituent_id: constituentId },
  });
  return NextResponse.json({ id: row.id, bench_linked: benchLinked });
}

/** PATCH — edit a placement. Audited with before AND after, because the
 *  scores and the warm path are judgements somebody will want to trace. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Fields | null;
  if (!body || typeof body.placement_id !== "string") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = placementFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { fields } = parsed;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const table = await loadTable(supabase, params.id, ctx.orgId);
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });

  const { data: beforeRow } = await supabase
    .from("fr_gift_table_placements")
    .select(
      "id, level_id, target_amount, cadence, term_years, capacity_score, affinity_score, " +
        "connection_score, readiness_score, warm_path, why_note, status, next_step, " +
        "next_step_due, owner, opportunity_id",
    )
    .eq("id", body.placement_id)
    .eq("gift_table_id", table.id)
    .maybeSingle();
  const before = beforeRow as unknown as (Fields & { id: string; opportunity_id: string | null }) | null;
  if (!before) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

  // Once linked, the target IS the opportunity's ask. Two numbers for one
  // donor is how a gift table becomes a second, disagreeing pipeline.
  if (before.opportunity_id && fields.target_amount !== undefined) {
    return NextResponse.json(
      { error: "This placement follows its ask. Change the amount on the opportunity." },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("fr_gift_table_placements")
    .update(fields)
    .eq("id", before.id)
    .eq("gift_table_id", table.id);
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That would put two names in one household slot." }, { status: 409 });
    }
    console.error("Update placement failed:", error.message);
    return NextResponse.json({ error: "Could not update that placement" }, { status: 500 });
  }

  const changedBefore: Fields = {};
  for (const key of Object.keys(fields)) changedBefore[key] = before[key];
  await audit(req, {
    action: "fundraising.gift_table_placement.update",
    entityType: "fr_gift_table_placement",
    entityId: before.id,
    before: changedBefore,
    after: fields,
  });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove a name from the table. Soft: status goes to `removed`,
 *  which releases the slot (both unique indexes exclude it) and keeps the
 *  scores and the warm path. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const placementId = req.nextUrl.searchParams.get("placement_id");
  if (!placementId) return NextResponse.json({ error: "Missing placement_id" }, { status: 400 });

  const supabase = createServerSupabase();
  const table = await loadTable(supabase, params.id, ctx.orgId);
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });

  const { data: row, error } = await supabase
    .from("fr_gift_table_placements")
    .update({ status: "removed" })
    .eq("id", placementId)
    .eq("gift_table_id", table.id)
    .select("id, status")
    .maybeSingle();
  if (error) {
    console.error("Remove placement failed:", error.message);
    return NextResponse.json({ error: "Could not remove that placement" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

  await audit(req, {
    action: "fundraising.gift_table_placement.remove",
    entityType: "fr_gift_table_placement",
    entityId: placementId,
    before: { status: "placed" },
    after: { status: "removed" },
  });
  return NextResponse.json({ ok: true });
}
