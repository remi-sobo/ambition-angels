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

  // One transaction: create the opportunity + link it + move the stage. The
  // function is idempotent (returns the existing opportunity if already
  // pursued), so no orphan opportunity can be left behind.
  const { data: oppId, error } = await supabase.rpc("fr_pursue_funder_angle", {
    p_fa_id: params.id,
    p_owner: (await getAdminUser()) ?? null,
  });
  if (error || !oppId) {
    const notFound = error?.code === "no_data_found" || /not found/i.test(error?.message ?? "");
    console.error("[pursue] failed:", error?.message);
    return NextResponse.json(
      { error: notFound ? "Not found" : "Could not pursue funder" },
      { status: notFound ? 404 : 500 }
    );
  }

  await audit(req, {
    action: "fundraising.funder_angle.pursue",
    entityType: "funder_angles",
    entityId: params.id,
    after: { opportunity_id: oppId, stage: "pursuing" },
  });
  await pushOpportunityToHubSpot(oppId as string);

  return NextResponse.json({ opportunity_id: oppId });
}
