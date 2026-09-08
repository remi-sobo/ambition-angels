import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBoardContext } from "@/lib/board/auth";

const VALID = new Set(["yes", "no", "unsure"]);

/** A director's own RSVP. The tally is board-wide — quorum matters — but only
 *  she can set her row ("director sets own rsvp" in RLS). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx?.memberId) return NextResponse.json({ error: "Not a director" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const rsvp = payload && typeof payload.rsvp === "string" ? payload.rsvp : "";
  if (!VALID.has(rsvp)) return NextResponse.json({ error: "Invalid rsvp" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("meeting_attendance")
    .update({ rsvp })
    .eq("meeting_id", params.id)
    .eq("board_member_id", ctx.memberId);

  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
