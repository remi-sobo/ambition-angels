import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { toggleReaction } from "@/lib/messaging/threads";

/** POST — toggle your reaction: { messageId: string, emoji: string }. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
  if (!messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  if (!emoji) return NextResponse.json({ error: "emoji is required" }, { status: 400 });

  const result = await toggleReaction(ctx, messageId, emoji);
  if (!result) return NextResponse.json({ error: "Could not react" }, { status: 400 });
  return NextResponse.json(result);
}
