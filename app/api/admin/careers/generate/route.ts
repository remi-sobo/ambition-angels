import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { generateCard, type OccupationInput } from "@/lib/ms/generate";
import { asRiasecProfile } from "@/lib/ms/riasec";

export const maxDuration = 120; // deep-tier call, possibly twice

// Generation step of the card pipeline (ms-career-library-v2.md step 3).
// Writes a DRAFT — never anything else. A gate-failing draft is regenerated
// once; if it still fails, the draft is stored with its failures so the
// review UI shows exactly why it is not ready. Approval is a human click in
// /admin/careers, structurally (ms_cards_approved_requires_review).
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { soc_code } = await req.json().catch(() => ({}));
  if (typeof soc_code !== "string" || !/^\d{2}-\d{4}$/.test(soc_code)) {
    return NextResponse.json({ error: "Invalid soc_code" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: occ } = await supabase
    .from("ms_occupations")
    .select("*")
    .eq("soc_code", soc_code)
    .maybeSingle();
  if (!occ) {
    return NextResponse.json({ error: "Occupation not imported" }, { status: 404 });
  }

  const { data: card } = await supabase
    .from("ms_cards")
    .select("soc_code, status")
    .eq("soc_code", soc_code)
    .maybeSingle();
  if (card && card.status === "approved") {
    // Already reviewed and live. Regenerating over an approved card is how
    // "AI wrote our curriculum" happens — unapprove first, deliberately.
    return NextResponse.json({ error: "Card is approved; unapprove it before regenerating" }, { status: 409 });
  }

  let input: OccupationInput;
  try {
    input = {
      socCode: occ.soc_code,
      title: occ.title,
      titleVariants: occ.title_variants ?? [],
      description: occ.description,
      tasks: occ.tasks ?? [],
      jobZone: occ.job_zone,
      payMedian: occ.pay_median,
      payP90: occ.pay_p90,
      payAsOf: occ.pay_as_of,
      educationTypical: occ.education_typical,
    };
    asRiasecProfile(occ.riasec); // fail loudly on a malformed import
  } catch (err) {
    return NextResponse.json(
      { error: `Occupation row is malformed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 }
    );
  }

  try {
    // One call per click. A gate-failing draft is stored WITH its failures
    // so the review UI shows exactly what is wrong and offers Regenerate —
    // a silent second deep-tier call doubled the wait and looked like a
    // hang from the admin's seat.
    const result = await generateCard(input);

    const { error } = await supabase.from("ms_cards").upsert(
      {
        soc_code,
        field: result.field || null,
        day_vignette: result.dayVignette,
        clue_1: result.clue1,
        clue_2: result.clue2,
        clue_3: result.clue3,
        clue_4: result.clue4,
        clue_5: result.clue5,
        clue_6: result.clue6,
        clue_7: result.clue7,
        clue_8: result.clue8,
        status: "draft",
        generated_by: result.model,
        generated_at: new Date().toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        reading_grade: result.gates.readingGrade,
        last_gate_result: result.gates,
      },
      { onConflict: "soc_code" }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, gates: result.gates });
  } catch (err) {
    console.error("Card generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
}
