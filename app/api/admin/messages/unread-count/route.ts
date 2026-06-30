import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { unreadCount } from "@/lib/messaging/threads";

/** Total unread messages for the signed-in user — drives the sidebar badge. */
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const count = await unreadCount(ctx);
    return NextResponse.json({ count });
  } catch (e) {
    console.error("[/api/admin/messages/unread-count] error:", e);
    return NextResponse.json({ count: 0 }); // graceful degrade, like notifications
  }
}
