import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Link (or unlink) a spine object to a plan strategy. The plan never copies a
// number out of the object — the link is the whole write, and the rollup reads
// through it at render time.

const TABLES = {
  opportunity: "opportunities",
  grant: "grants",
  campaign: "campaigns",
} as const;

type AssignType = keyof typeof TABLES;

/** PATCH /api/admin/fundraising/plan/assign
 *  { type: 'opportunity'|'grant'|'campaign', id, strategy_id: uuid|null } */
export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    type?: unknown;
    id?: unknown;
    strategy_id?: unknown;
  } | null;
  const type = body?.type as AssignType | undefined;
  if (
    !body ||
    !type ||
    !(type in TABLES) ||
    typeof body.id !== "string" ||
    !(typeof body.strategy_id === "string" || body.strategy_id === null)
  ) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  if (body.strategy_id !== null) {
    const { data: strategy } = await supabase
      .from("fr_plan_strategies")
      .select("id")
      .eq("id", body.strategy_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!strategy) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from(TABLES[type])
    .update({ plan_strategy_id: body.strategy_id })
    .eq("id", body.id)
    .eq("org_id", ctx.orgId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update the link" }, { status: 500 });
  if (!row) return NextResponse.json({ error: `${type} not found` }, { status: 404 });

  await audit(req, {
    action: "fundraising.plan.assign",
    entityType: type,
    entityId: row.id,
    after: { plan_strategy_id: body.strategy_id },
  });
  return NextResponse.json({ ok: true });
}
