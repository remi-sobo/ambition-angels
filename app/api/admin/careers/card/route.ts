import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { runGates } from "@/lib/ms/gates";

// Inline edits during review (ms-career-library-v2.md step 5). Only drafts
// are editable: approved content is immutable except through unapprove →
// edit → re-approve, so what a student reads is always exactly what a human
// last approved. Clues 6 and 7 are rendered from data and not editable here.
const EDITABLE = [
  "field",
  "day_vignette",
  "clue_1",
  "clue_2",
  "clue_3",
  "clue_4",
  "clue_5",
  "clue_8",
] as const;

export async function PATCH(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const socCode = body.soc_code;
  if (typeof socCode !== "string" || !/^\d{2}-\d{4}$/.test(socCode)) {
    return NextResponse.json({ error: "Invalid soc_code" }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};
  for (const key of EDITABLE) {
    if (key in body) {
      const val = body[key];
      if (val !== null && typeof val !== "string") {
        return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
      }
      updates[key] = typeof val === "string" ? val.trim() || null : null;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: card } = await supabase
    .from("ms_cards")
    .select("*, ms_occupations(title, title_variants, pay_median)")
    .eq("soc_code", socCode)
    .maybeSingle();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (card.status !== "draft") {
    return NextResponse.json({ error: "Only drafts are editable; unapprove first" }, { status: 409 });
  }

  // Re-run the gates on the edited card so the review UI always shows the
  // current truth, and human edits get the same cheap checks as drafts.
  const merged = { ...card, ...updates };
  const occ = card.ms_occupations as { title: string; title_variants: string[] | null; pay_median: number | null };
  const gates = runGates({
    title: occ.title,
    titleVariants: occ.title_variants ?? [],
    field: merged.field,
    dayVignette: merged.day_vignette,
    clues: [
      merged.clue_1,
      merged.clue_2,
      merged.clue_3,
      merged.clue_4,
      merged.clue_5,
      merged.clue_6,
      merged.clue_7,
      merged.clue_8,
    ],
    payMedian: occ.pay_median,
  });

  const { error } = await supabase
    .from("ms_cards")
    .update({ ...updates, reading_grade: gates.readingGrade, last_gate_result: gates })
    .eq("soc_code", socCode);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, gates });
}
