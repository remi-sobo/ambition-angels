import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

// Approve or discard one Reed draft (Phase 7, decision layer). Approving marks a
// draft ready for a human to send — it does NOT send anything. The kind's write
// permission is required to approve; any member may discard. RLS scopes the row
// to the caller's org.
const DRAFT_PERMISSION: Record<string, string> = {
  grant_narrative: "fundraising.write",
  acknowledgment: "fundraising.write",
  board_update: "board.write",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "approve" && action !== "discard") {
    return NextResponse.json({ error: "action must be 'approve' or 'discard'" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: draft } = await supabase.from("reed_drafts").select("id, kind").eq("id", params.id).maybeSingle();
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "approve") {
    const perm = DRAFT_PERMISSION[(draft as { kind: string }).kind] ?? "org.manage";
    if (!(await hasPermission(supabase, ctx.orgId, perm))) {
      return NextResponse.json({ error: `Requires ${perm}` }, { status: 403 });
    }
  }

  const status = action === "approve" ? "approved" : "discarded";
  const { error } = await supabase.from("reed_drafts").update({ status }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
