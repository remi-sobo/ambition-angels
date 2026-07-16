import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SNOOZE } from "@/lib/admin/thresholds";

/**
 * Briefing decision write-back (spec Phase 4). Every decision writes only to
 * bloomos_briefing_state — never the underlying task/compliance record — so it
 * is reversible: `undo` deletes the row and the item returns to the feed.
 *
 * POST { itemId, decision: "snooze" | "dismiss" | "mark_done" | "undo", hours? }
 */
export const dynamic = "force-dynamic";

type Body = {
  itemId?: string;
  decision?: "snooze" | "dismiss" | "mark_done" | "undo";
  hours?: number;
};

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { itemId, decision } = body;
  if (!itemId || !decision) {
    return NextResponse.json({ error: "itemId and decision are required" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  if (decision === "undo") {
    const { error } = await sb.from("bloomos_briefing_state").delete().eq("item_id", itemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, itemId, decision: "undo" });
  }

  const hidden_until =
    decision === "snooze"
      ? new Date(Date.now() + (body.hours ?? SNOOZE.hours) * 3_600_000).toISOString()
      : null;

  const { error } = await sb
    .from("bloomos_briefing_state")
    .upsert(
      { org_id: ctx.orgId, item_id: itemId, decision, hidden_until, updated_at: new Date().toISOString() },
      { onConflict: "item_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, itemId, decision, hidden_until });
}
