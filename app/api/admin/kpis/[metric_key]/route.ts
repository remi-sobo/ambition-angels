import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Upsert target/owner/active for a registry metric.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { metric_key: string } }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = params.metric_key;
  if (!/^[a-z0-9_]{1,60}$/.test(key)) {
    return NextResponse.json({ error: "Invalid metric key" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const row: Record<string, unknown> = { metric_key: key };
  if ("target" in body) {
    if (body.target === null) row.target = null;
    else if (typeof body.target === "number" && body.target >= 0)
      row.target = Math.round(body.target * 100) / 100;
  }
  if ("owner" in body)
    row.owner =
      body.owner === null || body.owner === ""
        ? null
        : typeof body.owner === "string"
        ? body.owner.trim().slice(0, 60)
        : null;
  if (typeof body.active === "boolean") row.active = body.active;

  const { error } = await getSupabaseAdmin()
    .from("kpi_settings")
    .upsert(row, { onConflict: "org_id,metric_key" });
  if (error) {
    console.error("KPI settings upsert failed:", error.message);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.kpi.settings",
    entityType: "kpi",
    after: row,
  });
  return NextResponse.json({ ok: true });
}
