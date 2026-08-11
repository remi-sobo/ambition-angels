import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { eligibilityIssues, REVEAL_LINE_MAX } from "@/lib/games/pool";

// Play-pool review actions (specs/teen-games-v1.md Phase 1). Approve is the
// gate: it re-runs the eligibility rules server-side against the live
// occupation row (a stale admin screen can't flip an unfair one) and stamps
// approved_by/approved_at from the session. There is no batch-approve; the
// DB constraint (game_pool_eligible_requires_approval) backs the stamp up
// even against future service-role code.
type Action = "approve" | "revoke" | "flags";

const SOC_RE = /^\d{2}-\d{4}$/;

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { soc_code, action } = body;
  if (typeof soc_code !== "string" || !SOC_RE.test(soc_code)) {
    return NextResponse.json({ error: "Invalid soc_code" }, { status: 400 });
  }
  if (!["approve", "revoke", "flags"].includes(action as string)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const flags: Record<string, boolean> = {};
  for (const key of ["higher_wage", "daily", "the_cut"] as const) {
    if (typeof body[key] === "boolean") flags[key] = body[key];
  }

  const supabase = getSupabaseAdmin();

  switch (action as Action) {
    case "approve": {
      const reveal = typeof body.reveal_line === "string" ? body.reveal_line.trim() : "";
      if (!reveal) {
        return NextResponse.json({ error: "Write the reveal line first" }, { status: 422 });
      }
      if (reveal.length > REVEAL_LINE_MAX) {
        return NextResponse.json(
          { error: `Reveal line is over ${REVEAL_LINE_MAX} characters — it's a spoken line, not a bio` },
          { status: 422 }
        );
      }

      const { data: occ } = await supabase
        .from("ms_occupations")
        .select("soc_code, title, description, pay_median")
        .eq("soc_code", soc_code)
        .maybeSingle();
      if (!occ) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const issues = eligibilityIssues(occ);
      if (issues.length > 0) {
        return NextResponse.json(
          { error: `Not eligible: ${issues.join(", ")}` },
          { status: 422 }
        );
      }

      const { error } = await supabase.from("game_pool").upsert({
        soc_code,
        eligible: true,
        reveal_line: reveal,
        approved_by: ctx.email,
        approved_at: new Date().toISOString(),
        ...flags,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, eligible: true });
    }
    case "revoke": {
      // Keep the reveal line: revoke pulls the occupation from play, it
      // doesn't erase the writing. Re-approving restamps.
      const { error } = await supabase
        .from("game_pool")
        .update({ eligible: false, approved_by: null, approved_at: null })
        .eq("soc_code", soc_code);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, eligible: false });
    }
    case "flags": {
      if (Object.keys(flags).length === 0) {
        return NextResponse.json({ error: "No flags to change" }, { status: 400 });
      }
      const { error } = await supabase.from("game_pool").update(flags).eq("soc_code", soc_code);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
  }
}
