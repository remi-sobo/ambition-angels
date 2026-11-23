import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { validateIdentityInput } from "@/lib/admin/orgIdentity";
import { saveOrgIdentity } from "@/lib/admin/orgSettings-server";
import { upsertFinConfig } from "@/lib/admin/finance";
import { audit } from "@/lib/audit";

// V4 Stage F: Settings → Organization. Name, legal name, address, EIN and
// time zone into orgs.settings (the identity thank-yous and receipts read,
// lib/email/org-identity.ts), and the fiscal year into fin_config. Owner and
// admin only (org.manage); every write is pinned to the ACTIVE org.
export async function PATCH(req: NextRequest) {
  const gate = await requirePermission("org.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const check = validateIdentityInput(body);
  if (!check.ok) return NextResponse.json({ error: check.error, field: check.field }, { status: 400 });

  const fy = body?.fiscal_year_start_month;
  if (fy !== undefined && fy !== null && (typeof fy !== "number" || !Number.isInteger(fy) || fy < 1 || fy > 12)) {
    return NextResponse.json({ error: "Choose the month your fiscal year starts.", field: "fiscal_year_start_month" }, { status: 400 });
  }

  const saved = await saveOrgIdentity(ctx.orgId, check.value);
  if (saved.error) {
    console.error("Organization save failed:", saved.error);
    return NextResponse.json({ error: "Your organization's details didn't save. Try again." }, { status: 500 });
  }
  if (typeof fy === "number") {
    const r = await upsertFinConfig(ctx.orgId, { fiscal_year_start_month: fy });
    if (r.error) {
      console.error("Fiscal year save failed:", r.error.message);
      return NextResponse.json({ error: "Your details saved, but the fiscal year didn't. Try again." }, { status: 500 });
    }
  }

  await audit(req, {
    action: "org.identity.update",
    entityType: "org",
    entityId: ctx.orgId,
    after: { ...check.value, fiscal_year_start_month: fy ?? null },
  });
  return NextResponse.json({ ok: true });
}
