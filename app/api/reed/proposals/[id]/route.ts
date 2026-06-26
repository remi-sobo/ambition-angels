import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

// Accept or dismiss one Reed plan proposal (Reed strategy Phase B, decision
// layer). This only RECORDS the decision — accepting does NOT write the plan.
// Applying an accepted proposal into plan_* is Phase D (a separate gated write).
// Accepting requires org.manage (the plan is leadership-owned); any member may
// dismiss. RLS scopes the row to the caller's org.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "action must be 'accept' or 'dismiss'" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  if (action === "accept" && !(await hasPermission(supabase, ctx.orgId, "org.manage"))) {
    return NextResponse.json({ error: "Requires org.manage" }, { status: 403 });
  }

  const status = action === "accept" ? "accepted" : "dismissed";
  const { error } = await supabase
    .from("reed_plan_proposals")
    .update({ status, decided_by: ctx.email, decided_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
