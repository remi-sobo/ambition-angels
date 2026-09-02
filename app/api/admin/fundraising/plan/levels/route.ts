import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// The gift-range table under one strategy. Levels are replaced wholesale —
// the table is small (≤ a dozen rows) and "save the table" is the unit a
// human thinks in, so partial patches would only invite drift.

/** PUT /api/admin/fundraising/plan/levels — replace a strategy's gift table. */
export async function PUT(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    strategy_id?: unknown;
    levels?: unknown;
  } | null;
  if (!body || typeof body.strategy_id !== "string" || !Array.isArray(body.levels)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const levels: { amount: number; count_needed: number }[] = [];
  for (const raw of body.levels.slice(0, 20)) {
    const l = raw as Record<string, unknown>;
    const amount = typeof l.amount === "number" ? Math.round(l.amount * 100) / 100 : NaN;
    const count = typeof l.count_needed === "number" ? Math.round(l.count_needed) : NaN;
    if (!(amount > 0) || !(count >= 1)) {
      return NextResponse.json(
        { error: "Every level needs a positive amount and a count of at least 1" },
        { status: 400 }
      );
    }
    levels.push({ amount, count_needed: count });
  }

  const supabase = createServerSupabase();
  // The strategy anchors the org check; its org_id (not the caller's word)
  // stamps the level rows.
  const { data: strategy } = await supabase
    .from("fr_plan_strategies")
    .select("id, org_id")
    .eq("id", body.strategy_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!strategy) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });

  const del = await supabase.from("fr_plan_gift_levels").delete().eq("strategy_id", strategy.id);
  if (del.error) return NextResponse.json({ error: "Could not replace gift table" }, { status: 500 });

  if (levels.length > 0) {
    const { error } = await supabase.from("fr_plan_gift_levels").insert(
      levels.map((l, i) => ({
        org_id: strategy.org_id,
        strategy_id: strategy.id,
        amount: l.amount,
        count_needed: l.count_needed,
        sort: i,
      }))
    );
    if (error) return NextResponse.json({ error: "Could not save gift table" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.plan.levels.replace",
    entityType: "fr_plan_strategy",
    entityId: strategy.id,
    after: { levels },
  });
  return NextResponse.json({ ok: true, count: levels.length });
}
