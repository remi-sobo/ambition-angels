import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { isUuid, str } from "@/app/admin/staff/_lib/guard";

// POST /api/admin/staff/reviews/feedback/:feedbackId — a rater fills/submits their
// own form. RLS ("write review_feedback" = rater-self OR staff.manage) is the
// boundary; a manager-above who can only READ the form can't write it.
// Body: { ratings: {competencyId:1..5}, strengths, growth, comments, submit }.
export async function POST(req: NextRequest, { params }: { params: { feedbackId: string } }) {
  if (!isUuid(params.feedbackId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerSupabase();

  const { data: fb } = await supabase
    .from("review_feedback")
    .select("id, cycle_id, org_id, review_cycles(rating_scale_max)")
    .eq("id", params.feedbackId)
    .maybeSingle();
  if (!fb) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  const rc = (fb as unknown as { review_cycles: { rating_scale_max: number } | { rating_scale_max: number }[] | null })
    .review_cycles;
  const scaleMax = (Array.isArray(rc) ? rc[0]?.rating_scale_max : rc?.rating_scale_max) ?? 5;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON" }, { status: 400 });

  // Sanitize ratings: numeric competency scores clamped to 1..scaleMax.
  const ratings: Record<string, number> = {};
  if (body.ratings && typeof body.ratings === "object") {
    for (const [k, v] of Object.entries(body.ratings as Record<string, unknown>)) {
      if (!isUuid(k)) continue;
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 1 && n <= scaleMax) ratings[k] = n;
    }
  }

  const submit = body.submit === true;
  const patch: Record<string, unknown> = {
    ratings,
    strengths: str(body.strengths, 4000),
    growth: str(body.growth, 4000),
    comments: str(body.comments, 4000),
  };
  if (submit) {
    patch.status = "submitted";
    patch.submitted_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("review_feedback")
    .update(patch)
    .eq("id", params.feedbackId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "You can't edit this form." }, { status: 403 });

  await audit(req, {
    action: submit ? "staff.review_feedback.submit" : "staff.review_feedback.save",
    entityType: "review_feedback",
    entityId: params.feedbackId,
  });
  return NextResponse.json({ ok: true });
}
