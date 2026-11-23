import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { validateTermsInput } from "@/lib/admin/termsEditor";
import { saveTerms } from "@/lib/admin/orgSettings-server";
import { audit } from "@/lib/audit";

// V4 Stage F: Settings → Terms. Rename the words BloomOS uses (org_terminology);
// an empty word goes back to the built-in one. Owner and admin only
// (org.manage); rows are pinned to the ACTIVE org.
export async function PUT(req: NextRequest) {
  const gate = await requirePermission("org.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const check = validateTermsInput(body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const error = await saveTerms(ctx.orgId, check.terms);
  if (error) {
    console.error("Terms save failed:", error);
    return NextResponse.json({ error: "Your words didn't save. Try again." }, { status: 500 });
  }
  await audit(req, { action: "org.terminology.update", entityType: "org_terminology", entityId: ctx.orgId, after: check.terms });
  return NextResponse.json({ ok: true });
}
