import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { markRead } from "@/lib/messaging/threads";

/** Mark a thread read: catch up last_read_at and clear its Inbox pointers. */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { threadId: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = await markRead(ctx, params.threadId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
