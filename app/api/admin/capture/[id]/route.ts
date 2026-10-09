import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireEntitlement } from "@/lib/admin/entitlements";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/capture/[id] (specs/bloomos-capture.md, C2 step 8): one
 * capture and its cards, through RLS. The policies are personal (created_by =
 * auth.uid()), so another member's capture is a 404, not a 403. No other
 * methods in this stage; confirm/discard/undo arrive in C3.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ent = await requireEntitlement("ai.capture");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createServerSupabase();
  const { data: capture } = await supabase
    .from("captures")
    .select(
      "id, org_id, created_by, created_at, updated_at, source_surface, context_type, context_id, transcript, duration_seconds, status, parse_error, model_used, ai_call_id",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!capture) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: cards } = await supabase
    .from("capture_cards")
    .select(
      "id, position, dest, status, entity_type, entity_id, heard_name, match_confidence, match_candidates, payload, decided_by, decided_at, applied_table, applied_id, created_at, updated_at",
    )
    .eq("capture_id", params.id)
    .order("position", { ascending: true });

  return NextResponse.json({ capture, cards: cards ?? [] });
}
