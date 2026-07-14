import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// The reveal (D8). Two withheld pieces, one door:
//   stage "clue_8" → the near-giveaway, fetched only when the slot is
//     tapped, so it is never sitting in the page payload for a kid to
//     scroll to early.
//   stage "answer" → the title. Returning it and writing the ms_explored
//     row are the SAME call, so the calibration metric (clues_used, the
//     clue the table was on when the guess landed) cannot be skipped.
//
// clues_used arrives from the client and is clamped server-side; the first
// completed run wins (upsert ignores repeats) so replaying a card cannot
// launder the number.
export async function POST(req: NextRequest) {
  const rl = rateLimit(`ms-reveal:${getClientIp(req)}`, { limit: 120, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const { session_id: sessionId, soc_code: socCode, stage } = body;
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  if (typeof socCode !== "string" || !/^\d{2}-\d{4}$/.test(socCode)) {
    return NextResponse.json({ error: "Invalid career" }, { status: 400 });
  }
  if (stage !== "clue_8" && stage !== "answer") {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const [{ data: session }, { data: card }] = await Promise.all([
    supabase.from("ms_sessions").select("id").eq("id", sessionId).maybeSingle(),
    supabase
      .from("ms_cards")
      .select("soc_code, clue_8, status, ms_occupations(title)")
      .eq("soc_code", socCode)
      .maybeSingle(),
  ]);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (!card || card.status !== "approved") {
    // Not approved = not in the catalog = it does not exist here.
    return NextResponse.json({ error: "Career not found" }, { status: 404 });
  }

  if (stage === "clue_8") {
    return NextResponse.json({ clue8: card.clue_8 });
  }

  const rawCluesUsed = body.clues_used;
  const cluesUsed =
    typeof rawCluesUsed === "number" && Number.isInteger(rawCluesUsed)
      ? Math.min(8, Math.max(1, rawCluesUsed))
      : 8;

  // First completion wins: ignoreDuplicates keeps the original clues_used
  // if the student replays the card.
  const { error } = await supabase
    .from("ms_explored")
    .upsert(
      { session_id: sessionId, soc_code: socCode, clues_used: cluesUsed },
      { onConflict: "session_id,soc_code", ignoreDuplicates: true }
    );
  if (error) {
    console.error("ms reveal: explored insert failed:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const occ = card.ms_occupations as unknown as { title: string } | null;
  return NextResponse.json({ title: occ?.title ?? "" });
}
