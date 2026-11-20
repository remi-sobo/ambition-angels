/**
 * Disconnect Gmail: revoke BloomOS's permission at Google and forget the
 * token. The org stays on the Gmail transport, so sending is blocked with a
 * clear "connect a Gmail account" message until someone reconnects.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { deleteGmailConnection } from "@/lib/comms/gmail-connection";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Only an org admin can disconnect Gmail." }, { status: 403 });
  }
  try {
    const accountEmail = await deleteGmailConnection(ctx.orgId);
    await audit(req, {
      action: "fundraising.comms_gmail.disconnect",
      entityType: "connection",
      entityId: null,
      before: { provider: "google_gmail", account_email: accountEmail },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("disconnect gmail failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't disconnect Gmail. Try again." }, { status: 500 });
  }
}
