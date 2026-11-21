import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { checkRemove, checkRoleChange, type MemberRole } from "@/lib/admin/people";
import { countOwners, getMembership, removeMember, restoreOwner, setMemberRole } from "@/lib/admin/people-server";
import { audit } from "@/lib/audit";

// Settings → People and roles: change one person's role in the ACTIVE org,
// or remove them from it. Owner/admin only (members.manage); rules in
// lib/admin/people.ts. The target is looked up in the active org only, so a
// user id from another org is a 404, never a write.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const gate = await requirePermission("members.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  if (!UUID.test(params.userId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const [target, owners] = await Promise.all([getMembership(ctx.orgId, params.userId), countOwners(ctx.orgId)]);
  const rule = checkRoleChange({ userId: ctx.userId, role: ctx.role }, target, body?.role, owners);
  if (!rule.ok) return NextResponse.json({ error: rule.error }, { status: rule.status });
  const role = body!.role as MemberRole;
  if (target!.role === role) return NextResponse.json({ ok: true, unchanged: true });

  const err = await setMemberRole(ctx.orgId, params.userId, role);
  if (err) {
    console.error("Role change failed:", err);
    return NextResponse.json({ error: "The role didn't change. Try again." }, { status: 500 });
  }
  // Two owners demoting each other at the same moment could both pass the
  // count check. Re-count after the write and put the role back if the org
  // was left with no owner.
  if (target!.role === "owner" && (await countOwners(ctx.orgId)) === 0) {
    await setMemberRole(ctx.orgId, params.userId, "owner");
    return NextResponse.json({ error: "This is the only owner. Make someone else an owner first." }, { status: 409 });
  }

  await audit(req, {
    action: "members.membership.update",
    entityType: "membership",
    entityId: params.userId,
    before: { role: target!.role },
    after: { role },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const gate = await requirePermission("members.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  if (!UUID.test(params.userId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [target, owners] = await Promise.all([getMembership(ctx.orgId, params.userId), countOwners(ctx.orgId)]);
  const rule = checkRemove({ userId: ctx.userId, role: ctx.role }, target, owners);
  if (!rule.ok) return NextResponse.json({ error: rule.error }, { status: rule.status });

  const err = await removeMember(ctx.orgId, params.userId);
  if (err) {
    console.error("Remove member failed:", err);
    return NextResponse.json({ error: "They weren't removed. Try again." }, { status: 500 });
  }
  // Same race as PATCH: never leave the org without an owner.
  if (target!.role === "owner" && (await countOwners(ctx.orgId)) === 0) {
    await restoreOwner(ctx.orgId, params.userId);
    return NextResponse.json({ error: "This is the only owner. Make someone else an owner first." }, { status: 409 });
  }

  await audit(req, {
    action: "members.membership.delete",
    entityType: "membership",
    entityId: params.userId,
    before: { role: target!.role },
  });
  return NextResponse.json({ ok: true });
}
