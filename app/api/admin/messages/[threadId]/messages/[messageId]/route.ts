import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { deleteMessage, editMessage } from "@/lib/messaging/threads";

/**
 * PATCH  — edit your own message: { body: string }.
 * DELETE — soft-delete your own message.
 * Both are sender-scoped in the lib (404 if it isn't yours).
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 4000;

export async function PATCH(req: NextRequest, { params }: { params: { messageId: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });
  if (text.length > MAX_BODY) return NextResponse.json({ error: "body too long" }, { status: 400 });

  const ok = await editMessage(ctx, params.messageId, text);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { messageId: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ok = await deleteMessage(ctx, params.messageId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
