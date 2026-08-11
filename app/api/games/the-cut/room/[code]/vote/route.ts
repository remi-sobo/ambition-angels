import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { standing } from "@/lib/games/the-cut";
import { loadRoom, isVoterId } from "../_room";

// Cast (or change) this phone's vote for the open round. The primary key
// (room, round, voter) makes the write idempotent: tap again to change
// your mind, refresh and re-tap to land in the same row. Also re-joins,
// so a phone that skipped the join call still counts toward quorum.

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const rl = rateLimit(`cut-vote:${getClientIp(req)}`, { limit: 300, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  if (!isVoterId(body.voterId) || typeof body.soc !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const loaded = await loadRoom(params.code);
  if (!loaded) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (loaded.expired) return NextResponse.json({ error: "This room has closed" }, { status: 410 });
  const { room } = loaded;

  if (room.state.phase !== "vote") {
    return NextResponse.json({ error: "This board is finished" }, { status: 409 });
  }
  if (!standing(room.state).some((c) => c.soc_code === body.soc)) {
    return NextResponse.json({ error: "That career is not on the board" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const [{ error: joinError }, { error: voteError }] = await Promise.all([
    supabase.from("cut_players").upsert({ room_id: room.id, voter_id: body.voterId }),
    supabase.from("cut_votes").upsert({
      room_id: room.id,
      round: room.state.round,
      voter_id: body.voterId,
      soc_code: body.soc,
    }),
  ]);
  if (joinError || voteError) {
    console.error("cut vote failed:", joinError ?? voteError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, round: room.state.round });
}
