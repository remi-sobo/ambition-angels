import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { toPublicState, quorumNeeded } from "@/lib/games/the-cut";
import { loadRoom } from "./_room";

// Room state poll — every phone and the projector hit this on an
// interval, so the per-IP budget assumes a whole classroom behind one
// NAT. The body is toPublicState (the leak boundary: standing careers
// carry no stats) plus the live participation numbers the projector
// shows: joined phones, votes in, quorum. Per-career tallies are NOT
// here — they arrive via history after resolve, so the count shows on
// the wall before the answer does and voters can't bandwagon.

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const rl = rateLimit(`cut-state:${getClientIp(req)}`, { limit: 1200, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const loaded = await loadRoom(params.code);
  if (!loaded) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  const { room, expired } = loaded;

  const supabase = getSupabaseAdmin();
  const [{ count: joined }, { count: votesIn }] = await Promise.all([
    supabase.from("cut_players").select("*", { count: "exact", head: true }).eq("room_id", room.id),
    supabase
      .from("cut_votes")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("round", room.state.round),
  ]);

  return NextResponse.json({
    roomCode: room.room_code,
    expired,
    joined: joined ?? 0,
    votesIn: votesIn ?? 0,
    quorum: quorumNeeded(joined ?? 0),
    ...toPublicState(room.state),
  });
}
