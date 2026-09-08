import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBoardContext } from "@/lib/board/auth";

/**
 * Toggle one prep row for the signed-in director.
 *
 * Deliberately the user-scoped client: RLS ("own prep write") is what stops a
 * director from completing someone else's checklist. The board_member_id
 * filter below is belt to that brace, not the security boundary.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx?.memberId) return NextResponse.json({ error: "Not a director" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const prepItemId = body && typeof body.prepItemId === "string" ? body.prepItemId : "";
  const completed = body?.completed === true;
  if (!prepItemId) return NextResponse.json({ error: "prepItemId is required" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("prep_items")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", prepItemId)
    .eq("meeting_id", params.id)
    .eq("board_member_id", ctx.memberId);

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
