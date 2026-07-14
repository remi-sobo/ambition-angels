import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { answersToTraits } from "@/lib/ms/instrument";
import { traitsToRiasec, asRiasecProfile } from "@/lib/ms/riasec";
import { rankCareers, type ScorableOccupation } from "@/lib/ms/score";
import { newClaimCode, normalizeClaimCode, ROOM_CODE_LENGTH } from "@/lib/ms/claim";
import { newHandle } from "@/lib/ms/handles";
import { generateSummary } from "@/lib/ms/summary";

export const maxDuration = 60; // scoring is instant; the summary call needs headroom

// Phase 2 spine (specs/ms-career-game.md solo flow): 30 tap answers in,
// a session out. Fully deterministic — the scorer is a pure function over
// the approved catalog, no model anywhere in this path (D3). The payload
// is 30 integers; there is no field a student could type an email or
// anything else into (COPPA is structural, not procedural).
export async function POST(req: NextRequest) {
  const rl = rateLimit(`ms-session:${getClientIp(req)}`, { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  let traits;
  try {
    traits = answersToTraits(body?.answers);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid answers" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // The catalog is the menu: approved cards only, joined to their imported
  // profiles. If nothing is approved yet there is nothing to rank — that is
  // a content state, not an error to paper over with a fallback.
  const { data: catalogRows, error: catErr } = await supabase
    .from("ms_cards")
    .select("soc_code, ms_occupations(riasec, job_zone)")
    .eq("status", "approved");
  if (catErr) {
    console.error("ms session: catalog read failed:", catErr);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const catalog: ScorableOccupation[] = [];
  for (const row of catalogRows ?? []) {
    const occ = row.ms_occupations as unknown as { riasec: unknown; job_zone: number } | null;
    if (!occ) continue;
    try {
      catalog.push({ socCode: row.soc_code, riasec: asRiasecProfile(occ.riasec), jobZone: occ.job_zone });
    } catch {
      console.error(`ms session: skipping malformed occupation ${row.soc_code}`);
    }
  }
  if (catalog.length === 0) {
    return NextResponse.json({ error: "The catalog is not ready yet" }, { status: 409 });
  }

  const ranked = rankCareers(traitsToRiasec(traits), catalog);

  // Phase 6: the three-sentence "what you're built for" — the first of the
  // two permitted live model calls. Input is six sums and three titles; no
  // free text from a child exists to send. Null on any failure: the results
  // page renders fine without it.
  const { data: topOccs } = await supabase
    .from("ms_occupations")
    .select("soc_code, title")
    .in("soc_code", ranked.slice(0, 3).map((r) => r.socCode));
  const titleBySoc = new Map((topOccs ?? []).map((o) => [o.soc_code, o.title]));
  const summaryText = await generateSummary(
    traits,
    ranked.slice(0, 3).map((r) => titleBySoc.get(r.socCode)).filter((t): t is string => Boolean(t))
  );

  // Group mode (Phase 5): a room code joins this session to a live room
  // and assigns a handle — never a typed name. A stale or wrong code is a
  // clear error before the student invests eight minutes.
  let roomId: string | null = null;
  let handle: string | null = null;
  if (body?.room_code != null) {
    const roomCode = typeof body.room_code === "string" ? normalizeClaimCode(body.room_code) : "";
    if (roomCode.length !== ROOM_CODE_LENGTH) {
      return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
    }
    const { data: room } = await supabase
      .from("ms_rooms")
      .select("id, expires_at")
      .eq("room_code", roomCode)
      .maybeSingle();
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (new Date(room.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Room has closed" }, { status: 410 });
    }
    roomId = room.id;
    const { data: taken } = await supabase
      .from("ms_sessions")
      .select("handle")
      .eq("room_id", room.id);
    const inUse = new Set((taken ?? []).map((t) => t.handle));
    for (let i = 0; i < 50 && !handle; i++) {
      const candidate = newHandle();
      if (!inUse.has(candidate)) handle = candidate;
    }
    if (!handle) handle = `Player ${inUse.size + 1}`;
  }

  // Claim-code collisions are survivable (28^6 space) but not impossible:
  // retry the unique insert a few times before giving up loudly.
  for (let attempt = 0; attempt < 3; attempt++) {
    const claimCode = newClaimCode();
    const { data, error } = await supabase
      .from("ms_sessions")
      .insert({
        claim_code: claimCode,
        trait_scores: traits,
        summary_text: summaryText,
        room_id: roomId,
        handle,
        ranked_careers: ranked.map((r) => ({
          soc_code: r.socCode,
          score: Math.round(r.score * 1000) / 1000,
          job_zone: r.jobZone,
          promoted: r.promoted,
        })),
      })
      .select("id")
      .single();
    if (!error && data) {
      return NextResponse.json({ sessionId: data.id, claimCode, handle });
    }
    if (error && error.code !== "23505") {
      console.error("ms session: insert failed:", error);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  }
  console.error("ms session: claim code collision three times — check RNG");
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
