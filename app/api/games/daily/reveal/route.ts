import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { loadToday } from "../_today";

// The answer: title, vignette, pay, education — served whether the player
// solved it or gave up (Phase 4 definition of done: giving up still shows
// the full reveal; the reveal is the point, the guessing is the hook).

export async function POST(req: NextRequest) {
  const rl = rateLimit(`daily-reveal:${getClientIp(req)}`, { limit: 300, windowMs: 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const today = await loadToday();
  if (!today) {
    return NextResponse.json({ error: "No job scheduled today" }, { status: 503 });
  }

  const { card } = today;
  return NextResponse.json({
    day: today.day,
    title: card.title,
    vignette: card.day_vignette,
    pay_median: card.pay_median,
    pay_p90: card.pay_p90,
    pay_as_of: card.pay_as_of,
    education: card.education_typical,
  });
}
