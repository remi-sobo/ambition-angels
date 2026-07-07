import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveManage, str } from "@/app/admin/staff/_lib/guard";

// PUT /api/admin/staff/terminology — rename a module term (e.g. "Staff" → "Team")
// for this tenant, no code change. staff.manage only. An empty label reverts to
// the built-in default by deleting the row.
export async function PUT(req: NextRequest) {
  const m = await resolveManage();
  if (!m) return NextResponse.json({ error: "No access" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const term_key = str(body?.term_key, 40) ?? "staff";
  const label = str(body?.label, 40);

  if (!label) {
    const { error } = await m.supabase
      .from("org_terminology")
      .delete()
      .eq("org_id", m.ctx.orgId)
      .eq("term_key", term_key);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { error } = await m.supabase
      .from("org_terminology")
      .upsert({ org_id: m.ctx.orgId, term_key, label }, { onConflict: "org_id,term_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await audit(req, { action: "staff.terminology.update", entityType: "org_terminology", after: { term_key, label } });
  return NextResponse.json({ ok: true, label: label ?? null });
}
