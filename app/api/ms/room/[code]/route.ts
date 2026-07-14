import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeClaimCode, ROOM_CODE_LENGTH } from "@/lib/ms/claim";

// Room state (Phase 5). Polled by the projected screen and by each
// student's device. Handles only — never emails, never tokens, and never
// another student's assigned career. A session that proves itself with its
// own uuid (?session=) gets exactly one extra fact: its own assignment.
// The wall never learns any career (that would spoil every round).

type StoredAssignment = {
  assigned_at: string;
  tables: { n: number; members: { session_id: string; handle: string; soc_code: string }[] }[];
};

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeClaimCode(params.code);
  if (code.length !== ROOM_CODE_LENGTH) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("ms_rooms")
    .select("id, room_code, table_assignments, expires_at")
    .eq("room_code", code)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const { data: sessions } = await supabase
    .from("ms_sessions")
    .select("id, handle")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true });

  const assignments = room.table_assignments as StoredAssignment | null;
  const tables =
    assignments?.tables.map((t) => ({ n: t.n, handles: t.members.map((m) => m.handle) })) ?? null;

  // The student's own assignment, only when the request carries the
  // session uuid (which only that student's device knows).
  const sessionId = req.nextUrl.searchParams.get("session");
  let you: { table: number; socCode: string } | null = null;
  if (assignments && sessionId && /^[0-9a-f-]{36}$/i.test(sessionId)) {
    for (const t of assignments.tables) {
      const me = t.members.find((m) => m.session_id === sessionId);
      if (me) {
        you = { table: t.n, socCode: me.soc_code };
        break;
      }
    }
  }

  return NextResponse.json({
    roomCode: room.room_code,
    expired: new Date(room.expires_at).getTime() < Date.now(),
    joined: (sessions ?? []).map((s) => s.handle).filter(Boolean),
    tables,
    you,
  });
}
