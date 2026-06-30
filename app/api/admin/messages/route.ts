import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { ensureThread, listThreads } from "@/lib/messaging/threads";

/**
 * GET  — my threads (newest-first, with preview + unread). Client poll source.
 * POST — open/create a thread: { recipientIds: string[], title?: string }.
 *        One recipient → deduped DM; several → group. Returns { threadId }.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const threads = await listThreads(ctx);
  return NextResponse.json({ threads });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const recipientIds = Array.isArray(body.recipientIds)
    ? body.recipientIds.filter((x): x is string => typeof x === "string")
    : [];
  if (recipientIds.length === 0) {
    return NextResponse.json({ error: "recipientIds is required" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title : null;

  const threadId = await ensureThread(ctx, recipientIds, title);
  if (!threadId) {
    return NextResponse.json({ error: "No valid recipients" }, { status: 400 });
  }
  return NextResponse.json({ threadId });
}
