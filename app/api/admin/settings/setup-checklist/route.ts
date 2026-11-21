import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { patchOrgSetting } from "@/lib/admin/orgSettings-server";
import { audit } from "@/lib/audit";

// V4 Stage F: the Home setup checklist's "Finish later" (dismiss) and "Show
// the setup list again" (restore). The only manual control on the list:
// steps complete from real data. Owner and admin only (org.manage), stored on
// the ACTIVE org's settings so the whole team sees the same list.
export async function POST(req: NextRequest) {
  const gate = await requirePermission("org.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const body = (await req.json().catch(() => null)) as { dismissed?: unknown } | null;
  if (typeof body?.dismissed !== "boolean") return NextResponse.json({ error: "Say whether to hide the list." }, { status: 400 });

  const value = body.dismissed ? { dismissed_at: new Date().toISOString(), dismissed_by: ctx.userId } : null;
  const error = await patchOrgSetting(ctx.orgId, "setup_checklist", value);
  if (error) {
    console.error("Checklist dismiss failed:", error);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
  await audit(req, { action: body.dismissed ? "org.setup.dismiss" : "org.setup.restore", entityType: "org", entityId: ctx.orgId });
  return NextResponse.json({ ok: true });
}
