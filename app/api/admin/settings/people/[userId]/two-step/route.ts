import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { checkTwoStepReset } from "@/lib/admin/people";
import { getMembership, resetTwoStep } from "@/lib/admin/people-server";
import { audit } from "@/lib/audit";

// Settings → People and roles → "Reset two-step login" (pre-SafeSpace item D
// recovery: Supabase TOTP has no recovery codes). Deletes the person's
// authenticators so they set one up again at next sign-in. Owner/admin only
// (members.manage), a member of the ACTIVE org only, never yourself, and only
// an owner resets an owner (lib/admin/people.ts checkTwoStepReset).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const gate = await requirePermission("members.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  if (!UUID.test(params.userId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const target = await getMembership(ctx.orgId, params.userId);
  const rule = checkTwoStepReset({ userId: ctx.userId, role: ctx.role }, target);
  if (!rule.ok) return NextResponse.json({ error: rule.error }, { status: rule.status });

  const result = await resetTwoStep(params.userId);
  if (!result.ok) {
    console.error("Two-step reset failed:", result.error);
    return NextResponse.json({ error: "Two-step login wasn't reset. Try again." }, { status: 500 });
  }

  await audit(req, {
    action: "members.two_step.reset",
    entityType: "membership",
    entityId: params.userId,
    before: { role: target!.role },
    after: { factorsRemoved: result.removed },
  });
  return NextResponse.json({ ok: true, removed: result.removed });
}
