import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyPairToken } from "@/lib/games/token";

// Resolve a Higher Wage tap. Only a token this server signed gets pay out
// of the database, and only after the choice is committed — the reveal is
// the answer, so both figures come back together with the verdict.

const RL = { limit: 300, windowMs: 60 * 1000 };

export async function POST(req: NextRequest) {
  const rl = rateLimit(`hw-guess:${getClientIp(req)}`, RL);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const { token, choice } = body;
  if (typeof token !== "string" || (choice !== "a" && choice !== "b")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const claims = verifyPairToken(token);
  if (!claims) {
    return NextResponse.json({ error: "That round expired — deal again" }, { status: 410 });
  }

  const supabase = getSupabaseAdmin();
  const { data: occs, error } = await supabase
    .from("ms_occupations")
    .select("soc_code, pay_median, pay_as_of, education_typical")
    .in("soc_code", [claims.a, claims.b]);
  if (error || !occs || occs.length !== 2) {
    console.error("higher-wage guess: pay read failed:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const bySoc = new Map(occs.map((o) => [o.soc_code, o]));
  const a = bySoc.get(claims.a);
  const b = bySoc.get(claims.b);
  if (!a?.pay_median || !b?.pay_median) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const picked = choice === "a" ? a : b;
  const other = choice === "a" ? b : a;
  return NextResponse.json({
    correct: picked.pay_median >= other.pay_median,
    a: { soc: a.soc_code, pay_median: a.pay_median, pay_as_of: a.pay_as_of, education: a.education_typical },
    b: { soc: b.soc_code, pay_median: b.pay_median, pay_as_of: b.pay_as_of, education: b.education_typical },
  });
}
