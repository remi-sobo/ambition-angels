import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBoardContext } from "@/lib/board/auth";

/**
 * Send selected private notes to the Chair.
 *
 * The request names agenda items, never note text. The server reads the
 * caller's own notes through the session client — RLS's "own notes" policy is
 * what makes that read possible and what makes it impossible to read anyone
 * else's — and copies the bodies into shared_notes.
 *
 * Two reasons the text is not taken from the request body: a client cannot
 * put words in a director's mouth, and what the Chair receives is provably
 * what she had written at the moment she pressed send.
 *
 * member_notes is untouched. Sending does not delete, alter or unlock the
 * private note; it makes a frozen copy in a different table.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx?.memberId) return NextResponse.json({ error: "Not a director" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const raw = payload && Array.isArray(payload.agendaItemIds) ? payload.agendaItemIds : null;
  const ids = raw?.filter((v: unknown): v is string => typeof v === "string" && v.length > 0) ?? [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Choose at least one note to send." }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Only this director's own notes, on this meeting. RLS would refuse anyone
  // else's; the filters make the intent explicit rather than implicit.
  const { data: notes, error: readErr } = await supabase
    .from("member_notes")
    .select("agenda_item_id, body")
    .eq("meeting_id", params.id)
    .eq("board_member_id", ctx.memberId)
    .in("agenda_item_id", ids);
  if (readErr) return NextResponse.json({ error: "Could not read your notes." }, { status: 500 });

  const rows = ((notes ?? []) as { agenda_item_id: string | null; body: string }[])
    .filter((n) => n.agenda_item_id && n.body.trim())
    .map((n) => ({
      org_id: ctx.orgId,
      meeting_id: params.id,
      agenda_item_id: n.agenda_item_id,
      board_member_id: ctx.memberId,
      body: n.body.trim(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Those notes are empty — nothing to send." }, { status: 400 });
  }

  const { error: insErr } = await supabase.from("shared_notes").insert(rows);
  if (insErr) {
    console.error("[board shared notes] insert failed:", insErr.message);
    return NextResponse.json({ error: "Could not send. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: rows.length });
}
