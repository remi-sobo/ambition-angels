import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { loadToday } from "../_today";

// The next rung of the ladder: clue n (2-8) for today's job. Fetching a
// clue is how a miss costs you — a cheater who pulls all eight at once is
// just playing on the hardest setting with extra steps; the title still
// only travels via the reveal route.

export async function POST(req: NextRequest) {
  const rl = rateLimit(`daily-clue:${getClientIp(req)}`, { limit: 300, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const n = typeof body.n === "number" ? Math.floor(body.n) : NaN;
  if (!(n >= 2 && n <= 8)) {
    return NextResponse.json({ error: "Invalid clue number" }, { status: 400 });
  }

  const today = await loadToday();
  if (!today) {
    return NextResponse.json({ error: "No job scheduled today" }, { status: 503 });
  }

  return NextResponse.json({ day: today.day, n, clue: today.card.clues[n - 1] });
}
