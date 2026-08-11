import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { loadRoom, isVoterId } from "../_room";

// Join a room: register this phone's random id so the quorum math knows
// the class size. Idempotent — a refresh re-joins the same id and nothing
// doubles (DoD: the room survives a student refreshing mid-vote).

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const rl = rateLimit(`cut-join:${getClientIp(req)}`, { limit: 120, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  if (!isVoterId(body.voterId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const loaded = await loadRoom(params.code);
  if (!loaded) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (loaded.expired) return NextResponse.json({ error: "This room has closed" }, { status: 410 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("cut_players")
    .upsert({ room_id: loaded.room.id, voter_id: body.voterId });
  if (error) {
    console.error("cut join failed:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
