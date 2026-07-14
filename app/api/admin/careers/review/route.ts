import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

// The review step (ms-career-library-v2.md step 5): the one that cannot be
// automated and will not be. Approve stamps reviewed_by/reviewed_at from
// the session — there is no batch-approve and there will not be one. The
// DB constraint (ms_cards_approved_requires_review) backs this up even
// against future service-role code.
type Action = "approve" | "unapprove" | "retire" | "delete";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { soc_code, action } = await req.json().catch(() => ({}));
  if (typeof soc_code !== "string" || !/^\d{2}-\d{4}$/.test(soc_code)) {
    return NextResponse.json({ error: "Invalid soc_code" }, { status: 400 });
  }
  if (!["approve", "unapprove", "retire", "delete"].includes(action as string)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: card } = await supabase
    .from("ms_cards")
    .select("soc_code, status, day_vignette, clue_1, clue_2, clue_3, clue_4, clue_5, clue_6, clue_7, clue_8")
    .eq("soc_code", soc_code)
    .maybeSingle();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  switch (action as Action) {
    case "approve": {
      if (card.status === "approved") {
        return NextResponse.json({ ok: true, status: "approved" });
      }
      // Structural facts only: every part of the ladder exists. Judgment
      // calls (tone, difficulty, truth) are exactly what the human click
      // asserts — the machine does not second-guess an edit Remi made.
      const clues = [
        card.clue_1, card.clue_2, card.clue_3, card.clue_4,
        card.clue_5, card.clue_6, card.clue_7, card.clue_8,
      ];
      const missing = clues.findIndex((c) => !c || !String(c).trim());
      if (!card.day_vignette || missing !== -1) {
        return NextResponse.json(
          { error: missing !== -1 ? `clue_${missing + 1} is empty` : "day_vignette is empty" },
          { status: 422 }
        );
      }
      const { error } = await supabase
        .from("ms_cards")
        .update({ status: "approved", reviewed_by: ctx.email, reviewed_at: new Date().toISOString() })
        .eq("soc_code", soc_code);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, status: "approved" });
    }
    case "unapprove": {
      const { error } = await supabase
        .from("ms_cards")
        .update({ status: "draft", reviewed_by: null, reviewed_at: null })
        .eq("soc_code", soc_code);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, status: "draft" });
    }
    case "retire": {
      const { error } = await supabase
        .from("ms_cards")
        .update({ status: "retired" })
        .eq("soc_code", soc_code);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, status: "retired" });
    }
    case "delete": {
      if (card.status === "approved") {
        return NextResponse.json({ error: "Retire or unapprove an approved card; do not delete it" }, { status: 409 });
      }
      const { error } = await supabase.from("ms_cards").delete().eq("soc_code", soc_code);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, status: "deleted" });
    }
  }
}
