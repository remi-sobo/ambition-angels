import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * A gift table's levels (specs/fundraising-gift-tables.md, Phase 2).
 *
 * "Save the table" is the unit a human thinks in, so this is one PUT over the
 * whole set. But it is NOT the delete-and-reinsert the v1 plan levels route
 * used: placements reference `level_id` with ON DELETE RESTRICT, so wiping
 * the rows would either fail loudly or — if that FK were ever relaxed — strand
 * every name on the table. Rows arriving with an id are updated in place, new
 * rows are inserted, and rows the payload drops are deleted only when nothing
 * is placed at them. A level with names on it comes back as a 409 that says
 * whose names they are.
 */

const CADENCES = ["one_time", "annual", "monthly"] as const;
type Cadence = (typeof CADENCES)[number];

type LevelInput = {
  id?: string;
  label: string;
  amount: number;
  cadence: Cadence;
  term_years: number | null;
  gifts_needed: number;
  prospects_per_gift: number;
  purpose: string | null;
  sort: number;
};

function parseLevels(raw: unknown[]): { levels: LevelInput[] } | { error: string } {
  const levels: LevelInput[] = [];
  const capped = raw.slice(0, 40);
  for (let i = 0; i < capped.length; i++) {
    const l = capped[i] as Record<string, unknown>;

    const label = typeof l.label === "string" ? l.label.trim().slice(0, 80) : "";
    if (!label) return { error: `Level ${i + 1} needs a label` };

    const amount = typeof l.amount === "number" ? Math.round(l.amount * 100) / 100 : NaN;
    if (!(amount > 0)) return { error: `Level ${label} needs an amount above zero` };

    const cadence = (typeof l.cadence === "string" ? l.cadence : "one_time") as Cadence;
    if (!CADENCES.includes(cadence)) return { error: `Level ${label} has an unknown cadence` };

    // term_years applies to annual levels only. A monthly level is modeled
    // from the table's monthly_modeled_years; a one-time gift has no term.
    let termYears: number | null = null;
    if (cadence === "annual" && l.term_years !== null && l.term_years !== undefined) {
      const t = l.term_years;
      if (typeof t !== "number" || !Number.isInteger(t) || t < 1 || t > 20) {
        return { error: `Level ${label} needs a term between 1 and 20 years` };
      }
      termYears = t;
    }

    const giftsNeeded = typeof l.gifts_needed === "number" ? Math.round(l.gifts_needed) : NaN;
    if (!(giftsNeeded >= 1)) return { error: `Level ${label} needs at least one gift` };

    const ppg =
      typeof l.prospects_per_gift === "number" ? Math.round(l.prospects_per_gift) : NaN;
    if (!(ppg >= 1)) return { error: `Level ${label} needs at least one prospect per gift` };

    levels.push({
      id: typeof l.id === "string" ? l.id : undefined,
      label,
      amount,
      cadence,
      term_years: termYears,
      gifts_needed: giftsNeeded,
      prospects_per_gift: ppg,
      purpose: typeof l.purpose === "string" ? l.purpose.trim().slice(0, 500) || null : null,
      sort: i,
    });
  }
  return { levels };
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { levels?: unknown } | null;
  if (!body || !Array.isArray(body.levels)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseLevels(body.levels);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { levels } = parsed;

  const supabase = createServerSupabase();
  // The table anchors the org check; its org_id — not the caller's word —
  // stamps every level row. The DB's org-match trigger enforces this too.
  const { data: table } = await supabase
    .from("fr_gift_tables")
    .select("id, org_id, status")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });
  if (table.status === "closed" || table.status === "archived") {
    return NextResponse.json({ error: "A closed table's levels are frozen" }, { status: 409 });
  }

  const { data: existingRows } = await supabase
    .from("fr_gift_table_levels")
    .select("id")
    .eq("gift_table_id", table.id);
  const existing = new Set((existingRows ?? []).map((r) => r.id as string));

  // An id the caller invented, or one belonging to another table, must not
  // silently become an insert — that would duplicate a level.
  for (const l of levels) {
    if (l.id && !existing.has(l.id)) {
      return NextResponse.json({ error: "A level no longer exists. Reload and try again." }, { status: 409 });
    }
  }

  const keep = new Set(levels.map((l) => l.id).filter((v): v is string => !!v));
  const dropped = Array.from(existing).filter((id) => !keep.has(id));

  // Never delete a level out from under the names placed at it.
  if (dropped.length > 0) {
    const { data: placed } = await supabase
      .from("fr_gift_table_placements")
      .select("level_id")
      .in("level_id", dropped)
      .neq("status", "removed");
    if (placed && placed.length > 0) {
      return NextResponse.json(
        {
          error:
            `That level still has ${placed.length} name${placed.length === 1 ? "" : "s"} placed at it. ` +
            "Move them first, then remove the level.",
        },
        { status: 409 },
      );
    }
  }

  for (const l of levels) {
    const row = {
      label: l.label,
      amount: l.amount,
      cadence: l.cadence,
      term_years: l.term_years,
      gifts_needed: l.gifts_needed,
      prospects_per_gift: l.prospects_per_gift,
      purpose: l.purpose,
      sort: l.sort,
    };
    const { error } = l.id
      ? await supabase
          .from("fr_gift_table_levels")
          .update(row)
          .eq("id", l.id)
          .eq("gift_table_id", table.id)
      : await supabase
          .from("fr_gift_table_levels")
          .insert({ ...row, gift_table_id: table.id, org_id: table.org_id });
    if (error) {
      console.error("Save gift table level failed:", error.message);
      return NextResponse.json({ error: `Could not save level ${l.label}` }, { status: 500 });
    }
  }

  if (dropped.length > 0) {
    const { error } = await supabase
      .from("fr_gift_table_levels")
      .delete()
      .in("id", dropped)
      .eq("gift_table_id", table.id);
    if (error) {
      console.error("Remove gift table level failed:", error.message);
      return NextResponse.json({ error: "Could not remove a level" }, { status: 500 });
    }
  }

  await audit(req, {
    action: "fundraising.gift_table.levels.save",
    entityType: "fr_gift_table",
    entityId: table.id,
    before: { level_ids: Array.from(existing) },
    after: { levels, removed: dropped },
  });
  return NextResponse.json({ ok: true, count: levels.length });
}
