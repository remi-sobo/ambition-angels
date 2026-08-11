import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { dayNumber } from "@/lib/games/guess";
import { acceptedHashes } from "@/lib/games/daily";
import { loadToday } from "./_today";

// Today's mystery career (specs/teen-games-v1.md Phase 4). The response
// carries clue 1 and the accepted-answer hash set — never the title, never
// a SOC code. Guesses are matched in the browser against the hashes using
// the same normalization the server used, so a wrong guess costs no round
// trip and the typed guess never leaves the phone. Everyone everywhere
// gets the same job: the day is computed in America/Los_Angeles on the
// server, not from the device clock.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rl = rateLimit(`daily:${getClientIp(req)}`, { limit: 300, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const today = await loadToday();
  if (!today) {
    return NextResponse.json(
      { error: "No job scheduled today — check back tomorrow" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    day: today.day,
    dayNumber: dayNumber(today.day),
    totalClues: 8,
    clue: today.card.clues[0],
    answers: acceptedHashes(today.card.title, today.card.title_variants),
  });
}
