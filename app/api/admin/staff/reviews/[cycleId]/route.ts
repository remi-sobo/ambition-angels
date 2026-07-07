import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveManage, isUuid, str, num } from "@/app/admin/staff/_lib/guard";

const MODES = new Set(["transparent", "confidential", "anonymous"]);
const STATUSES = new Set(["draft", "collecting", "synthesizing", "shared", "closed"]);

// PATCH /api/admin/staff/reviews/:cycleId — update cycle status/anonymity/dates.
export async function PATCH(req: NextRequest, { params }: { params: { cycleId: string } }) {
  if (!isUuid(params.cycleId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const m = await resolveManage();
  if (!m) return NextResponse.json({ error: "No access" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const n = str(body.name, 120);
    if (!n) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    patch.name = n;
  }
  if ("status" in body && STATUSES.has(String(body.status))) patch.status = String(body.status);
  if ("anonymity_mode" in body && MODES.has(String(body.anonymity_mode))) patch.anonymity_mode = String(body.anonymity_mode);
  if ("min_raters_for_anonymity" in body) patch.min_raters_for_anonymity = num(body.min_raters_for_anonymity) ?? 3;
  if ("opens_on" in body) patch.opens_on = str(body.opens_on, 10);
  if ("closes_on" in body) patch.closes_on = str(body.closes_on, 10);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await m.supabase
    .from("review_cycles")
    .update(patch)
    .eq("id", params.cycleId)
    .eq("org_id", m.ctx.orgId)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  await audit(req, { action: "staff.review_cycle.update", entityType: "review_cycles", entityId: params.cycleId, after: patch });
  return NextResponse.json({ ok: true, cycle: data });
}
