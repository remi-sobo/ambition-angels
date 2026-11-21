import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { generateBriefing } from "@/lib/briefing";
import { requirePermission } from "@/lib/admin/requirePermission";

// POST — generate a fresh on-demand briefing (gather → narrate → store).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requirePermission("ops.write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const result = await generateBriefing(getSupabaseAdmin(), "on_demand");
  await audit(req, {
    action: "briefing.generate",
    entityType: "briefing",
    after: { model: result.model, headline: result.headline },
  });
  return NextResponse.json({ ok: true, narrated: !!result.narrative });
}
