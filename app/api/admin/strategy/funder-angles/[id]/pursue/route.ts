/**
 * POST /api/admin/strategy/funder-angles/[id]/pursue — promote a funder to the
 * pipeline. Creates an opportunity for the funder's constituent (labelled with
 * the angle), links it back on funder_angles.opportunity_id, and moves the row
 * to stage 'pursuing' / decision 'pursue'. Idempotent: if an opportunity is
 * already linked it's returned as-is. The funder then appears on Major Gifts.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { pushOpportunityToHubSpot } from "@/lib/hubspot/sync-out";

export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: fa } = await supabase
    .from("funder_angles")
    .select("id, constituent_id, opportunity_id, angle:strategy_angles ( name )")
    .eq("id", params.id)
    .maybeSingle();
  if (!fa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Already pursued — return the existing opportunity.
  if (fa.opportunity_id) {
    return NextResponse.json({ opportunity_id: fa.opportunity_id, already: true });
  }

  const angleName = (fa.angle as { name?: string } | null)?.name ?? null;
  const { data: opp, error: oppErr } = await supabase
    .from("opportunities")
    .insert({
      constituent_id: fa.constituent_id,
      name: angleName,
      stage: "cultivate",
      owner: (await getAdminUser()) ?? null,
    })
    .select("id")
    .single();
  if (oppErr || !opp) {
    console.error("[pursue] create opportunity failed:", oppErr?.message);
    return NextResponse.json({ error: "Could not create opportunity" }, { status: 500 });
  }

  const { error: upErr } = await supabase
    .from("funder_angles")
    .update({ opportunity_id: opp.id, stage: "pursuing", decision: "pursue" })
    .eq("id", params.id);
  if (upErr) {
    console.error("[pursue] link opportunity failed:", upErr.message);
    return NextResponse.json({ error: "Opportunity created but could not link it" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.funder_angle.pursue",
    entityType: "funder_angles",
    entityId: params.id,
    after: { opportunity_id: opp.id, stage: "pursuing" },
  });
  await pushOpportunityToHubSpot(opp.id);

  return NextResponse.json({ opportunity_id: opp.id });
}
