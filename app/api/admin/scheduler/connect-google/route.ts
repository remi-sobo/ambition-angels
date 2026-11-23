/**
 * Disconnect the scheduler Google account: forget the stored token, and
 * revoke it at Google only when no other BloomOS connection (or the env
 * token) uses the same account (lib/google/grant.ts). /meet then falls back
 * to the env GOOGLE_REFRESH_TOKEN, if one is set.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { deleteSchedulerConnection } from "@/lib/google/scheduler-connection";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Only an org admin can disconnect the scheduler Google account." }, { status: 403 });
  }
  try {
    const accountEmail = await deleteSchedulerConnection(ctx.orgId);
    await audit(req, {
      action: "org.scheduler_google.disconnect",
      entityType: "connection",
      entityId: null,
      before: { provider: "google_scheduler", account_email: accountEmail },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("disconnect scheduler google failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Couldn't disconnect. Try again." }, { status: 500 });
  }
}
