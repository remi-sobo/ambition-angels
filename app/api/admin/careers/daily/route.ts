import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { lowZoneViolation, LOW_ZONE_PER_WEEK, LOW_ZONE_MAX } from "@/lib/games/daily";

// Schedule (or clear) a daily job (specs/teen-games-v1.md Phase 4). Only
// occupations behind both gates — pool-eligible for the daily AND an
// approved card — are schedulable, and the pacing rule is enforced here,
// not just drawn in the UI: no save may complete a run of seven days with
// fewer than three jobs at job zone 3 or lower.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOC_RE = /^\d{2}-\d{4}$/;

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { day, soc_code } = body;
  if (typeof day !== "string" || !DAY_RE.test(day)) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  if (soc_code === null) {
    const { error } = await supabase.from("game_daily").delete().eq("game", "nhoi").eq("day", day);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (typeof soc_code !== "string" || !SOC_RE.test(soc_code)) {
    return NextResponse.json({ error: "Invalid soc_code" }, { status: 400 });
  }

  // Both gates, re-checked server-side.
  const [{ data: pool }, { data: card }, { data: occ }] = await Promise.all([
    supabase
      .from("game_pool")
      .select("soc_code")
      .eq("soc_code", soc_code)
      .eq("eligible", true)
      .eq("daily", true)
      .maybeSingle(),
    supabase
      .from("ms_cards")
      .select("soc_code")
      .eq("soc_code", soc_code)
      .eq("status", "approved")
      .maybeSingle(),
    supabase.from("ms_occupations").select("soc_code, job_zone").eq("soc_code", soc_code).maybeSingle(),
  ]);
  if (!pool) {
    return NextResponse.json(
      { error: "Not in the pool for the daily — flip it eligible first" },
      { status: 422 }
    );
  }
  if (!card) {
    return NextResponse.json(
      { error: "No approved card — the daily needs the full clue ladder" },
      { status: 422 }
    );
  }
  if (!occ) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Pacing rule against the surrounding two weeks as they would be.
  const from = new Date(Date.parse(day) - 6 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(day) + 6 * 86_400_000).toISOString().slice(0, 10);
  const { data: window } = await supabase
    .from("game_daily")
    .select("day, soc_code")
    .eq("game", "nhoi")
    .gte("day", from)
    .lte("day", to);
  const windowSocs = Array.from(new Set((window ?? []).map((w) => w.soc_code).concat(soc_code)));
  const { data: zones } = await supabase
    .from("ms_occupations")
    .select("soc_code, job_zone")
    .in("soc_code", windowSocs);
  const zoneBySoc = new Map((zones ?? []).map((z) => [z.soc_code, z.job_zone]));
  const zonesByDay = new Map<string, number>();
  for (const w of window ?? []) {
    const z = zoneBySoc.get(w.soc_code);
    if (z !== undefined) zonesByDay.set(String(w.day), z);
  }
  zonesByDay.set(day, occ.job_zone);

  const violation = lowZoneViolation(zonesByDay, day);
  if (violation) {
    return NextResponse.json(
      {
        error:
          `That fills ${violation.start} – ${violation.end} with only ${violation.lowCount} ` +
          `job${violation.lowCount === 1 ? "" : "s"} a teen can reach without a four-year degree — ` +
          `the week needs ${LOW_ZONE_PER_WEEK} at job zone ${LOW_ZONE_MAX} or lower.`,
      },
      { status: 422 }
    );
  }

  const { error } = await supabase.from("game_daily").upsert({ game: "nhoi", day, soc_code });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
