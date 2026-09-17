import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * Gift tables — create and edit (specs/fundraising-gift-tables.md, Phase 2).
 *
 * Only what a human DECIDES is accepted here: the window, the target, the
 * multiplier, the coverage basis, and the rationale for each. Table goal,
 * table shape, names per level, gaps and the verdict are computed at read
 * time in lib/fundraising/gift-table.ts and have no column to be typed into.
 * That is the rule the whole feature rests on — the exported workbooks drifted
 * from the spine precisely because they stored their own answers.
 */

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const BASES = ["window", "annual", "full_term"] as const;

/** Statuses Phase 2 can set. `closed` writes a plan-vs-actual snapshot and
 *  `archived` hides the table — both ship in Phase 5, so accepting them now
 *  would leave a closed table with no snapshot and no way back. */
const SETTABLE_STATUS = ["draft", "active"] as const;

const money = (v: number): number => Math.round(v * 100) / 100;

type Fields = Record<string, unknown>;

/** Validate the editable surface. Returns a message instead of throwing so
 *  every rejection reaches the user as a sentence (V3 §13). */
function tableFields(body: Fields): { fields: Fields } | { error: string } {
  const out: Fields = {};

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 160);
    if (!name) return { error: "Every gift table needs a name" };
    out.name = name;
  }
  if (body.starts_on !== undefined) {
    if (!isISODate(body.starts_on)) return { error: "Start date must be a date" };
    out.starts_on = body.starts_on;
  }
  if (body.ends_on !== undefined) {
    if (!isISODate(body.ends_on)) return { error: "End date must be a date" };
    out.ends_on = body.ends_on;
  }
  if (
    isISODate(out.starts_on) &&
    isISODate(out.ends_on) &&
    (out.ends_on as string) < (out.starts_on as string)
  ) {
    return { error: "The window ends before it starts" };
  }

  if (body.target !== undefined) {
    if (typeof body.target !== "number" || !(body.target >= 0)) {
      return { error: "Target must be zero or more" };
    }
    out.target = money(body.target);
  }
  if (body.multiplier !== undefined) {
    if (typeof body.multiplier !== "number" || !(body.multiplier > 0)) {
      return { error: "Multiplier must be greater than zero" };
    }
    out.multiplier = Math.round(body.multiplier * 1000) / 1000;
  }
  if (body.goal_round_to !== undefined) {
    if (body.goal_round_to === null) out.goal_round_to = null;
    else if (
      typeof body.goal_round_to !== "number" ||
      !Number.isInteger(body.goal_round_to) ||
      body.goal_round_to <= 0
    ) {
      return { error: "Rounding must be a whole number above zero, or blank" };
    } else out.goal_round_to = body.goal_round_to;
  }

  if (body.coverage_basis !== undefined) {
    if (!BASES.includes(body.coverage_basis as (typeof BASES)[number])) {
      return { error: "Coverage basis must be window, annual, or full term" };
    }
    out.coverage_basis = body.coverage_basis;
  }
  for (const key of ["default_term_years", "monthly_modeled_years"] as const) {
    if (body[key] === undefined) continue;
    const v = body[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 20) {
      return { error: "Years must be a whole number between 1 and 20" };
    }
    out[key] = v;
  }
  for (const key of ["ratio_major", "ratio_mid", "ratio_base"] as const) {
    if (body[key] === undefined) continue;
    const v = body[key];
    if (typeof v !== "number" || !(v > 0)) {
      return { error: "Prospects per gift must be greater than zero" };
    }
    out[key] = Math.round(v * 100) / 100;
  }
  if (body.major_threshold !== undefined) {
    if (body.major_threshold === null) out.major_threshold = null;
    else if (typeof body.major_threshold !== "number" || !(body.major_threshold > 0)) {
      return { error: "Major threshold must be above zero, or blank" };
    } else out.major_threshold = money(body.major_threshold);
  }

  for (const key of ["target_rationale", "multiplier_rationale", "notes"] as const) {
    if (typeof body[key] === "string") {
      out[key] = (body[key] as string).trim().slice(0, 4000) || null;
    }
  }
  for (const key of ["campaign_id", "strategy_id"] as const) {
    if (body[key] === undefined) continue;
    if (body[key] === null) out[key] = null;
    else if (typeof body[key] === "string") out[key] = body[key];
    else return { error: "Invalid link" };
  }

  if (body.status !== undefined) {
    if (!SETTABLE_STATUS.includes(body.status as (typeof SETTABLE_STATUS)[number])) {
      return {
        error:
          body.status === "closed" || body.status === "archived"
            ? "Closing and archiving a table ship with the close snapshot"
            : "Status must be draft or active",
      };
    }
    out.status = body.status;
  }

  return { fields: out };
}

/** POST /api/admin/fundraising/gift-tables — create a table. */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Fields | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = tableFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { fields } = parsed;

  if (!fields.name) return NextResponse.json({ error: "Every gift table needs a name" }, { status: 400 });
  if (!fields.starts_on || !fields.ends_on) {
    return NextResponse.json({ error: "A gift table needs a start and an end date" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: row, error } = await supabase
    .from("fr_gift_tables")
    // org_id from the session, never the request body.
    .insert({ ...fields, org_id: ctx.orgId })
    .select("id")
    .single();
  if (error || !row) {
    console.error("Create gift table failed:", error?.message);
    return NextResponse.json({ error: "Could not create the gift table" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.gift_table.create",
    entityType: "fr_gift_table",
    entityId: row.id,
    after: fields,
  });
  return NextResponse.json({ id: row.id });
}

/** PATCH /api/admin/fundraising/gift-tables — edit a table, including its
 *  draft/active status. Audited with before AND after: the target and the
 *  multiplier are the two numbers the whole table rescales from, and a change
 *  to either needs to be answerable later. */
export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Fields | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = tableFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { fields } = parsed;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  // A concatenated select string defeats PostgREST's type inference, so the
  // row is cast — the same shape the fundraising pages use.
  const { data: beforeRow } = await supabase
    .from("fr_gift_tables")
    .select(
      "id, name, starts_on, ends_on, status, target, multiplier, goal_round_to, coverage_basis, " +
        "default_term_years, monthly_modeled_years, ratio_major, ratio_mid, ratio_base, " +
        "major_threshold, target_rationale, multiplier_rationale, notes, campaign_id, strategy_id",
    )
    .eq("id", body.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  const before = beforeRow as unknown as (Fields & {
    id: string;
    status: string;
    starts_on: string;
    ends_on: string;
  }) | null;
  if (!before) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });

  // A closed or archived table is frozen; reopening ships with the close
  // snapshot, so don't let an edit quietly resurrect one.
  if (before.status === "closed" || before.status === "archived") {
    return NextResponse.json(
      { error: "This table is closed. Reopening ships with the close snapshot." },
      { status: 409 },
    );
  }

  // The window must still make sense after a one-sided edit.
  const startsOn = (fields.starts_on as string) ?? before.starts_on;
  const endsOn = (fields.ends_on as string) ?? before.ends_on;
  if (endsOn < startsOn) {
    return NextResponse.json({ error: "The window ends before it starts" }, { status: 400 });
  }

  const { error } = await supabase
    .from("fr_gift_tables")
    .update(fields)
    .eq("id", body.id)
    .eq("org_id", ctx.orgId);
  if (error) {
    console.error("Update gift table failed:", error.message);
    return NextResponse.json({ error: "Could not update the gift table" }, { status: 500 });
  }

  // Only the keys that actually changed, so the history reads as a diff.
  const changedBefore: Fields = {};
  for (const key of Object.keys(fields)) {
    changedBefore[key] = before[key];
  }
  await audit(req, {
    action:
      fields.status && Object.keys(fields).length === 1
        ? "fundraising.gift_table.status"
        : "fundraising.gift_table.update",
    entityType: "fr_gift_table",
    entityId: before.id,
    before: changedBefore,
    after: fields,
  });
  return NextResponse.json({ ok: true });
}
