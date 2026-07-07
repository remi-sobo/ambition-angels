import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveManage, str, num } from "@/app/admin/staff/_lib/guard";

const MODES = new Set(["transparent", "confidential", "anonymous"]);

// POST /api/admin/staff/reviews — create a review cycle. staff.manage only.
export async function POST(req: NextRequest) {
  const m = await resolveManage();
  if (!m) return NextResponse.json({ error: "No access" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = str(body?.name, 120);
  if (!name) return NextResponse.json({ error: "A cycle name is required." }, { status: 400 });
  const anonymity_mode = MODES.has(String(body?.anonymity_mode)) ? String(body?.anonymity_mode) : "confidential";

  const insert = {
    org_id: m.ctx.orgId,
    name,
    anonymity_mode,
    min_raters_for_anonymity: num(body?.min_raters_for_anonymity) ?? 3,
    opens_on: str(body?.opens_on, 10),
    closes_on: str(body?.closes_on, 10),
    created_by: m.ctx.userId,
  };
  const { data, error } = await m.supabase.from("review_cycles").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(req, {
    action: "staff.review_cycle.create",
    entityType: "review_cycles",
    entityId: data.id,
    after: { name, anonymity_mode },
  });
  return NextResponse.json({ ok: true, cycle: data });
}
