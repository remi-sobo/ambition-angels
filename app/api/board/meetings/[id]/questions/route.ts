import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBoardContext } from "@/lib/board/auth";

/**
 * Ask a question on the materials before the meeting.
 *
 * Visibility is asymmetric on purpose: the asker sees her own questions and
 * their answers, board_admin sees all of them with the asker named, and
 * nothing is board-wide. A visible thread would be discussion outside a
 * noticed meeting.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx?.memberId) return NextResponse.json({ error: "Not a director" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const body = payload && typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Write a question first." }, { status: 400 });
  if (body.length > 4000) return NextResponse.json({ error: "That is too long to send." }, { status: 400 });

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("member_questions")
    .insert({ org_id: ctx.orgId, meeting_id: params.id, board_member_id: ctx.memberId, body })
    .select("id, body, answer_body, answered_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Could not send" }, { status: 500 });
  return NextResponse.json({ ok: true, question: data });
}
