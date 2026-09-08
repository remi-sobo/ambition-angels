import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBoardContext } from "@/lib/board/auth";

/**
 * Save one private note.
 *
 * The user-scoped client is mandatory here, not stylistic. RLS ("own notes")
 * is the only thing that keeps a director's notes away from board_admin, and
 * getSupabaseAdmin() would bypass it. There is deliberately no GET that takes
 * a board_member_id, and no admin read path anywhere in the codebase.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx?.memberId) return NextResponse.json({ error: "Not a director" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const agendaItemId = payload && typeof payload.agendaItemId === "string" ? payload.agendaItemId : null;
  const body = payload && typeof payload.body === "string" ? payload.body : "";
  if (!agendaItemId) return NextResponse.json({ error: "agendaItemId is required" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("member_notes").upsert(
    {
      org_id: ctx.orgId,
      meeting_id: params.id,
      agenda_item_id: agendaItemId,
      board_member_id: ctx.memberId,
      body,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "meeting_id,agenda_item_id,board_member_id" },
  );

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
