import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { isOutcome } from "@/lib/admin/ops/close";

/**
 * Set or clear the Friday outcome on one week_commitments row (Weekly Plan v2,
 * PR 4). Close derives most outcomes from the task itself; this route carries
 * the one it can't, "Partly done", and lets it be undone. Session client: RLS
 * (ops.write + own rows) decides, and the org/user filters make a foreign id
 * a 404 rather than a silent no-op.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const outcome = body?.outcome;
  if (outcome !== null && !isOutcome(outcome)) {
    return NextResponse.json(
      { error: "outcome must be done, partial, missed, deferred, dropped, or null" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("week_commitments")
    .update({ outcome, outcome_at: outcome ? new Date().toISOString() : null })
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .select("id, outcome, outcome_at")
    .maybeSingle();
  if (error) {
    console.error("[/api/admin/ops/commitments/:id PATCH] error:", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Failed to save the outcome" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ commitment: data });
}
