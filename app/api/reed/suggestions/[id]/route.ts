import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

// Accept or dismiss one cross-module Reed suggestion (Phase 7, decision layer).
// Accepting records the human's decision — it does NOT execute the action.
// Accepting requires the domain's write permission; any member may dismiss.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "action must be 'accept' or 'dismiss'" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: sug } = await supabase.from("reed_suggestions").select("id, domain").eq("id", params.id).maybeSingle();
  if (!sug) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "accept") {
    const perm = `${(sug as { domain: string }).domain}.write`;
    if (!(await hasPermission(supabase, ctx.orgId, perm))) {
      return NextResponse.json({ error: `Requires ${perm}` }, { status: 403 });
    }
  }

  const status = action === "accept" ? "accepted" : "dismissed";
  const { error } = await supabase
    .from("reed_suggestions")
    .update({ status, decided_by: ctx.email, decided_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
