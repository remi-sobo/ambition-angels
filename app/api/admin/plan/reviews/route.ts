import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Log a completed monthly OGSM review (Phase 4). The plan tables already hold
// the live state edited during the walkthrough; this row is the ritual's
// record — its count feeds "reviews completed this year" and its next_review_at
// drives the cockpit/briefing nudge.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const insert: Record<string, unknown> = {
    org_id: ctx.orgId,
    conducted_by: ctx.email || null,
  };
  if (typeof body?.notes === "string" && body.notes.trim())
    insert.notes = body.notes.trim().slice(0, 8000);
  if (isISODate(body?.next_review_at)) insert.next_review_at = body!.next_review_at;

  const { data, error } = await getSupabaseAdmin()
    .from("plan_reviews")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Log review failed:", error?.message);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.review.create",
    entityType: "plan_review",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
