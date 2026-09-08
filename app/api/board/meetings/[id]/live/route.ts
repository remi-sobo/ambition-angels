import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBoardContext } from "@/lib/board/auth";
import { audit } from "@/lib/audit";

/**
 * Running the meeting: start, previous, next, adjourn.
 *
 * board_admin only, and enforced twice — the context check here and RLS
 * ("board write agenda_items") underneath, since the user-scoped client is
 * what performs the writes.
 *
 * Advancing sets exactly one item to 'current', everything before it to
 * 'done', and everything after to 'upcoming'. Recomputing the whole agenda
 * rather than nudging two rows means a double-tap, a stale tab, or two
 * browsers cannot leave the agenda with two current items.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx?.isAdmin) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const action = payload && typeof payload.action === "string" ? payload.action : "";
  const supabase = createServerSupabase();

  const { data: items } = await supabase
    .from("agenda_items")
    .select("id, position, status")
    .eq("meeting_id", params.id)
    .order("position");
  const rows = (items ?? []) as { id: string; position: number; status: string }[];
  if (rows.length === 0) return NextResponse.json({ error: "No agenda" }, { status: 400 });

  const currentIndex = rows.findIndex((r) => r.status === "current");

  let target: number | null = null;
  if (action === "start") target = 0;
  else if (action === "next") target = Math.min(currentIndex + 1, rows.length - 1);
  else if (action === "prev") target = Math.max(currentIndex - 1, 0);
  else if (action !== "adjourn") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  if (action === "adjourn") {
    // Everything done, meeting closed. The minutes are drafted from here.
    await supabase.from("agenda_items").update({ status: "done" }).eq("meeting_id", params.id);
    await supabase.from("board_meetings").update({ status: "closed" }).eq("id", params.id);
    await audit(req, {
      action: "board.meeting_adjourned",
      entityType: "board_meeting",
      entityId: params.id,
      actorUserId: null,
      after: { by: ctx.email },
    });
    return NextResponse.json({ ok: true, status: "closed" });
  }

  const t = target as number;
  // Three bulk writes, not one per row: the agenda is small and this keeps
  // the whole advance atomic enough that no observer sees two current items.
  const before = rows.slice(0, t).map((r) => r.id);
  const after = rows.slice(t + 1).map((r) => r.id);
  if (before.length) await supabase.from("agenda_items").update({ status: "done" }).in("id", before);
  if (after.length) await supabase.from("agenda_items").update({ status: "upcoming" }).in("id", after);
  await supabase.from("agenda_items").update({ status: "current" }).eq("id", rows[t].id);

  if (action === "start") {
    await supabase.from("board_meetings").update({ status: "live" }).eq("id", params.id);
    await audit(req, {
      action: "board.meeting_started",
      entityType: "board_meeting",
      entityId: params.id,
      actorUserId: null,
      after: { by: ctx.email },
    });
  }

  return NextResponse.json({ ok: true, currentId: rows[t].id });
}
