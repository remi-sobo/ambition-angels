import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { pickPair, toPairCard, type PoolPlayRow } from "@/lib/games/higher-wage";
import { signPairToken, PAIR_TOKEN_TTL_MS } from "@/lib/games/token";

// Deal a Higher Wage pair (specs/teen-games-v1.md Phase 3). The response
// carries titles, reveal lines, and a signed token — never pay. Pay stays
// server-side until the guess route resolves the token after the tap;
// tests/games-higher-wage.test.ts asserts the payload shape. Reads only
// human-approved game_pool rows (locked decision 5: read-only, no writes).

// Below this many playable rows the game serves the same faces on repeat
// and the streak is unearnable — say "still stocking" instead of shipping
// a bad round.
const MIN_POOL = 10;
// A classroom is many phones behind one IP: the limit is per-IP, so it has
// to absorb 30 kids playing at gameplay pace, not one kid.
const RL = { limit: 300, windowMs: 60 * 1000 };
// Cap the exclude list so a hostile client can't null out the deck.
const MAX_EXCLUDE = 120;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`hw-pair:${getClientIp(req)}`, RL);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const streak =
    typeof body.streak === "number" && Number.isFinite(body.streak)
      ? Math.max(0, Math.floor(body.streak))
      : 0;
  const exclude: string[] = Array.isArray(body.exclude)
    ? body.exclude.filter((s: unknown) => typeof s === "string").slice(0, MAX_EXCLUDE)
    : [];

  const supabase = getSupabaseAdmin();
  const { data: pool, error } = await supabase
    .from("game_pool")
    .select("soc_code, reveal_line")
    .eq("eligible", true)
    .eq("higher_wage", true);
  if (error) {
    console.error("higher-wage pair: pool read failed:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  if (!pool || pool.length < MIN_POOL) {
    return NextResponse.json(
      { error: "Still stocking the game — check back soon" },
      { status: 503 }
    );
  }

  const { data: occs, error: occError } = await supabase
    .from("ms_occupations")
    .select("soc_code, title, pay_median")
    .in("soc_code", pool.map((p) => p.soc_code));
  if (occError || !occs) {
    console.error("higher-wage pair: occupations read failed:", occError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const revealBySoc = new Map(pool.map((p) => [p.soc_code, p.reveal_line as string]));
  const rows: PoolPlayRow[] = occs
    .filter((o) => o.pay_median != null && revealBySoc.has(o.soc_code))
    .map((o) => ({
      soc_code: o.soc_code,
      title: o.title,
      reveal_line: revealBySoc.get(o.soc_code)!,
      pay_median: o.pay_median!,
    }));

  const pair = pickPair(rows, streak, exclude);
  if (!pair) {
    return NextResponse.json(
      { error: "Still stocking the game — check back soon" },
      { status: 503 }
    );
  }

  const exp = Date.now() + PAIR_TOKEN_TTL_MS;
  return NextResponse.json({
    token: signPairToken({ a: pair.a.soc_code, b: pair.b.soc_code, exp }),
    a: toPairCard(pair.a),
    b: toPairCard(pair.b),
  });
}
