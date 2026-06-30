import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getMessages, postMessage } from "@/lib/messaging/threads";

/**
 * GET  — messages in a thread, oldest-first. `?after=<iso>` returns only newer
 *        ones (the open-conversation poll). 404 if you're not a member.
 * POST — send a message: { body: string }. Returns the created message.
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 4000;

export async function GET(req: NextRequest, { params }: { params: { threadId: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const after = req.nextUrl.searchParams.get("after");
  const messages = await getMessages(ctx, params.threadId, after);
  if (messages === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });
  if (text.length > MAX_BODY) return NextResponse.json({ error: "body too long" }, { status: 400 });

  const message = await postMessage(ctx, params.threadId, text);
  if (!message) return NextResponse.json({ error: "Could not send" }, { status: 400 });
  return NextResponse.json({ message });
}
