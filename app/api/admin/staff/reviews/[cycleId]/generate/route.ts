import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveManage, isUuid } from "@/app/admin/staff/_lib/guard";
import { generateAssignments } from "@/app/admin/staff/_lib/generate";

// POST /api/admin/staff/reviews/:cycleId/generate — build rater assignments from
// the org chart (self + manager + reports + peers). Idempotent. staff.manage only.
// Returns per-subject counts and the small-team anonymity warning.
export async function POST(req: NextRequest, { params }: { params: { cycleId: string } }) {
  if (!isUuid(params.cycleId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const m = await resolveManage();
  if (!m) return NextResponse.json({ error: "No access" }, { status: 403 });

  // Confirm the cycle is in this org (RLS-visible).
  const { data: cycle } = await m.supabase
    .from("review_cycles")
    .select("id")
    .eq("id", params.cycleId)
    .eq("org_id", m.ctx.orgId)
    .maybeSingle();
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const result = await generateAssignments(m.supabase, m.ctx.orgId, params.cycleId);

  // Move a fresh cycle into collecting once assignments exist.
  await m.supabase
    .from("review_cycles")
    .update({ status: "collecting" })
    .eq("id", params.cycleId)
    .eq("status", "draft");

  await audit(req, {
    action: "staff.review_cycle.generate",
    entityType: "review_cycles",
    entityId: params.cycleId,
    after: { inserted: result.inserted, subjects: result.subjects.length },
  });
  return NextResponse.json({ ok: true, ...result });
}
