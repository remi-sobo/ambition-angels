import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { checkInvite, normalizeEmail } from "@/lib/admin/people";
import { inviteMember } from "@/lib/admin/people-server";
import { audit } from "@/lib/audit";

// Settings → People and roles: invite someone into the ACTIVE org.
// Owner/admin only (members.manage); rules in lib/admin/people.ts.
export async function POST(req: NextRequest) {
  const gate = await requirePermission("members.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Enter a full email address." }, { status: 400 });
  const rule = checkInvite({ userId: ctx.userId, role: ctx.role }, body?.role);
  if (!rule.ok) return NextResponse.json({ error: rule.error }, { status: rule.status });
  const role = body!.role as Parameters<typeof inviteMember>[2];

  const out = await inviteMember(ctx.orgId, email, role, `${req.nextUrl.origin}/auth/callback?next=/admin/reset-password`);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });

  await audit(req, {
    action: "members.membership.create",
    entityType: "membership",
    entityId: out.userId,
    after: { email, role, emailed: out.emailed },
  });
  return NextResponse.json({ ok: true, userId: out.userId, emailed: out.emailed });
}
