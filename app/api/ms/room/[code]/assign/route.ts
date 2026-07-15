import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeClaimCode, ROOM_CODE_LENGTH } from "@/lib/ms/claim";
import { assignTables, type RoomStudent } from "@/lib/ms/room";

// Host-only: deal the tables (D5). Random tables of four, career dedup
// within each table, assignment delivered to each student's own device via
// the state endpoint — never to the wall. Gated by host_token because the
// room code is public to everyone in the room.
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeClaimCode(params.code);
  if (code.length !== ROOM_CODE_LENGTH) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const hostToken = typeof body.host_token === "string" ? body.host_token : "";

  const supabase = getSupabaseAdmin();
  const { data: room } = await supabase
    .from("ms_rooms")
    .select("id, host_token, expires_at")
    .eq("room_code", code)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (room.host_token !== hostToken) {
    return NextResponse.json({ error: "Not the host" }, { status: 403 });
  }
  if (new Date(room.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Room has closed" }, { status: 410 });
  }

  const { data: sessions } = await supabase
    .from("ms_sessions")
    .select("id, handle, ranked_careers")
    .eq("room_id", room.id);
  if (!sessions || sessions.length < 2) {
    return NextResponse.json({ error: "Need at least two students to make tables" }, { status: 409 });
  }

  const { data: explored } = await supabase
    .from("ms_explored")
    .select("session_id, soc_code")
    .in("session_id", sessions.map((s) => s.id));
  const exploredBySession = new Map<string, string[]>();
  for (const row of explored ?? []) {
    const list = exploredBySession.get(row.session_id) ?? [];
    list.push(row.soc_code);
    exploredBySession.set(row.session_id, list);
  }

  const students: RoomStudent[] = sessions.map((s) => ({
    sessionId: s.id,
    handle: s.handle ?? "Player",
    ranked: ((s.ranked_careers ?? []) as { soc_code: string }[]).map((r) => r.soc_code),
    explored: exploredBySession.get(s.id) ?? [],
  }));

  const tables = assignTables(students);
  const { error } = await supabase
    .from("ms_rooms")
    .update({
      table_assignments: {
        assigned_at: new Date().toISOString(),
        tables: tables.map((t) => ({
          n: t.n,
          members: t.members.map((m) => ({
            session_id: m.sessionId,
            handle: m.handle,
            soc_code: m.socCode,
          })),
        })),
      },
    })
    .eq("id", room.id);
  if (error) {
    console.error("ms room assign: update failed:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tableCount: tables.length });
}
