import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { newRoomCode } from "@/lib/ms/claim";
import { newRoomState, pickBoard, BOARD_SIZE, type CutCareer } from "@/lib/games/the-cut";

// Open a Cut room (specs/teen-games-v1.md Phase 5). Unlike a Built For
// room there is no host email — The Cut delivers nothing afterward, so it
// collects nothing. The response carries host_token; the opening screen
// keeps it, because the room code itself goes on a projector and cannot
// gate anything. The board and shuffled rule deck are snapshotted into
// the room here — nothing about a live board changes if the pool does.

export async function POST(req: NextRequest) {
  const rl = rateLimit(`cut-room:${getClientIp(req)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = getSupabaseAdmin();
  const { data: pool, error: poolError } = await supabase
    .from("game_pool")
    .select("soc_code, reveal_line")
    .eq("eligible", true)
    .eq("the_cut", true);
  if (poolError) {
    console.error("cut room: pool read failed:", poolError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  if (!pool || pool.length < BOARD_SIZE) {
    return NextResponse.json(
      { error: "Still stocking the game — check back soon" },
      { status: 503 }
    );
  }

  const socs = pool.map((p) => p.soc_code);
  const [{ data: occs, error: occError }, { data: cards }] = await Promise.all([
    supabase
      .from("ms_occupations")
      .select("soc_code, title, pay_median, pay_p90, job_zone, education_typical, riasec")
      .in("soc_code", socs),
    supabase
      .from("ms_cards")
      .select("soc_code, field, day_vignette")
      .eq("status", "approved")
      .in("soc_code", socs),
  ]);
  if (occError || !occs) {
    console.error("cut room: occupations read failed:", occError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const revealBySoc = new Map(pool.map((p) => [p.soc_code, p.reveal_line as string]));
  const cardBySoc = new Map((cards ?? []).map((c) => [c.soc_code, c]));
  const rows: CutCareer[] = occs
    .filter((o) => o.pay_median != null && revealBySoc.has(o.soc_code))
    .map((o) => ({
      soc_code: o.soc_code,
      title: o.title,
      reveal_line: revealBySoc.get(o.soc_code)!,
      pay_median: o.pay_median!,
      pay_p90: o.pay_p90,
      job_zone: o.job_zone,
      education_typical: o.education_typical,
      riasec: (o.riasec ?? {}) as Record<string, number>,
      field: cardBySoc.get(o.soc_code)?.field ?? null,
      day_vignette: cardBySoc.get(o.soc_code)?.day_vignette ?? null,
    }));

  const board = pickBoard(rows);
  if (!board) {
    return NextResponse.json(
      { error: "Still stocking the game — check back soon" },
      { status: 503 }
    );
  }

  const state = newRoomState(board);
  for (let attempt = 0; attempt < 3; attempt++) {
    const roomCode = newRoomCode();
    const { data, error } = await supabase
      .from("cut_rooms")
      .insert({ room_code: roomCode, state })
      .select("id, room_code, host_token, expires_at")
      .single();
    if (!error && data) {
      return NextResponse.json({
        roomCode: data.room_code,
        hostToken: data.host_token,
        expiresAt: data.expires_at,
      });
    }
    if (error && error.code !== "23505") {
      console.error("cut room: create failed:", error);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
