import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { answersToTraits } from "@/lib/ms/instrument";
import { traitsToRiasec, asRiasecProfile } from "@/lib/ms/riasec";
import { rankCareers, type ScorableOccupation } from "@/lib/ms/score";
import { newClaimCode } from "@/lib/ms/claim";

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

  // Claim-code collisions are survivable (28^6 space) but not impossible:
  // retry the unique insert a few times before giving up loudly.
  for (let attempt = 0; attempt < 3; attempt++) {
    const claimCode = newClaimCode();
    const { data, error } = await supabase
      .from("ms_sessions")
      .insert({
        claim_code: claimCode,
        trait_scores: traits,
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
      return NextResponse.json({ sessionId: data.id, claimCode });
    }
    if (error && error.code !== "23505") {
      console.error("ms session: insert failed:", error);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  }
  console.error("ms session: claim code collision three times — check RNG");
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
