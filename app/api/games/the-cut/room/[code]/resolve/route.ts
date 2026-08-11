import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveRound, toPublicState, quorumNeeded } from "@/lib/games/the-cut";
import { loadRoom } from "../_room";

// Close the open round: host only. The round cannot resolve until a
// quorum of joined phones has voted — the named mitigation for "25 kids
// watch three kids play" — unless the facilitator forces it (a dead
// phone must not hold a class hostage). The optimistic round guard on
// the update makes a double-tap of the resolve button a no-op instead of
// a double cut.

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const rl = rateLimit(`cut-resolve:${getClientIp(req)}`, { limit: 60, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const loaded = await loadRoom(params.code);
  if (!loaded) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (loaded.expired) return NextResponse.json({ error: "This room has closed" }, { status: 410 });
  const { room } = loaded;

  if (typeof body.hostToken !== "string" || body.hostToken !== room.host_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (room.state.phase !== "vote") {
    return NextResponse.json({ error: "This board is finished" }, { status: 409 });
  }

  const supabase = getSupabaseAdmin();
  const [{ count: joined }, { data: votes, error: votesError }] = await Promise.all([
    supabase.from("cut_players").select("*", { count: "exact", head: true }).eq("room_id", room.id),
    supabase
      .from("cut_votes")
      .select("soc_code")
      .eq("room_id", room.id)
      .eq("round", room.state.round),
  ]);
  if (votesError) {
    console.error("cut resolve: votes read failed:", votesError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const tally: Record<string, number> = {};
  for (const v of votes ?? []) tally[v.soc_code] = (tally[v.soc_code] ?? 0) + 1;
  const votesIn = (votes ?? []).length;
  const quorum = quorumNeeded(joined ?? 0);

  if (votesIn < quorum && body.force !== true) {
    return NextResponse.json(
      { error: `Waiting on votes — ${votesIn} of ${quorum} needed`, votesIn, quorum },
      { status: 409 }
    );
  }

  const next = resolveRound(room.state, tally);
  const { data: updated, error: updateError } = await supabase
    .from("cut_rooms")
    .update({ state: next })
    .eq("id", room.id)
    .eq("state->>round", String(room.state.round))
    .select("id");
  if (updateError) {
    console.error("cut resolve: update failed:", updateError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    // Someone (a double-tap) already resolved this round; serve fresh state.
    const fresh = await loadRoom(params.code);
    return NextResponse.json({
      alreadyResolved: true,
      ...(fresh ? toPublicState(fresh.room.state) : {}),
    });
  }

  return NextResponse.json(toPublicState(next));
}
