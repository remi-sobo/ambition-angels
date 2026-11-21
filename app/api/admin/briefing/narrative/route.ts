import { NextResponse } from "next/server";
import { gatherBriefingView } from "@/lib/admin/briefing/gather";
import { generateNarrativeNow } from "@/lib/admin/briefing/narrate";
import { requirePermission } from "@/lib/admin/requirePermission";

/**
 * Force-regenerate today's morning narrative (the "Regenerate" control on the
 * brief). Gathers a fresh spine view and re-runs the Sonnet call, overwriting
 * the cached row. Admin-only.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requirePermission("ops.write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { briefing, pulse, followups } = await gatherBriefingView();
  const narrative = await generateNarrativeNow(briefing, pulse, followups);
  return NextResponse.json({ ok: true, narrative });
}
