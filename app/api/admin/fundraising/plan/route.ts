import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// The Fundraising Plan's strategies (specs/fundraising-plan.md). A strategy
// holds only what a human decides — name, goal, owner, notes. Committed and
// pipeline figures roll up live from the spine, so there is no numeric field
// here a caller could type a "committed" into.

const currentYear = () => new Date().getFullYear();

function strategyFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) out.name = body.name.trim().slice(0, 120);
  if (typeof body.goal === "number" && body.goal >= 0) out.goal = Math.round(body.goal * 100) / 100;
  if (typeof body.owner === "string") out.owner = body.owner.trim().slice(0, 120) || null;
  if (typeof body.notes === "string") out.notes = body.notes.trim().slice(0, 4000) || null;
  if (typeof body.sort === "number" && Number.isInteger(body.sort)) out.sort = body.sort;
  return out;
}

/** POST /api/admin/fundraising/plan — create a strategy. */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const fields = strategyFields(body);
  if (!fields.name) return NextResponse.json({ error: "Every strategy needs a name" }, { status: 400 });
  const planYear =
    typeof body.plan_year === "number" && Number.isInteger(body.plan_year)
      ? body.plan_year
      : currentYear();

  const supabase = createServerSupabase();
  const { data: row, error } = await supabase
    .from("fr_plan_strategies")
    .insert({ ...fields, org_id: ctx.orgId, plan_year: planYear })
    .select("id")
    .single();
  if (error || !row) {
    const duplicate = error?.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "A strategy with that name already exists for this year" : "Could not create strategy" },
      { status: duplicate ? 409 : 500 }
    );
  }

  await audit(req, {
    action: "fundraising.plan.strategy.create",
    entityType: "fr_plan_strategy",
    entityId: row.id,
    after: { ...fields, plan_year: planYear },
  });
  return NextResponse.json({ id: row.id });
}

/** PATCH /api/admin/fundraising/plan — update a strategy's editable fields. */
export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const fields = strategyFields(body);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: row, error } = await supabase
    .from("fr_plan_strategies")
    .update(fields)
    .eq("id", body.id)
    .eq("org_id", ctx.orgId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update strategy" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });

  await audit(req, {
    action: "fundraising.plan.strategy.update",
    entityType: "fr_plan_strategy",
    entityId: row.id,
    after: fields,
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/fundraising/plan?id= — delete a strategy. Linked spine
 *  objects are released (plan_strategy_id → null via FK), never touched. */
export async function DELETE(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: row, error } = await supabase
    .from("fr_plan_strategies")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("id, name")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not delete strategy" }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });

  await audit(req, {
    action: "fundraising.plan.strategy.delete",
    entityType: "fr_plan_strategy",
    entityId: id,
    after: { name: row.name },
  });
  return NextResponse.json({ ok: true });
}
