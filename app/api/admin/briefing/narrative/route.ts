import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin/auth";
import { gatherBriefingView } from "@/lib/admin/briefing/gather";
import { generateNarrativeNow } from "@/lib/admin/briefing/narrate";

/**
 * Force-regenerate today's morning narrative (the "Regenerate" control on the
 * brief). Gathers a fresh spine view and re-runs the Sonnet call, overwriting
 * the cached row. Admin-only.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { briefing, pulse } = await gatherBriefingView();
  const narrative = await generateNarrativeNow(briefing, pulse);
  return NextResponse.json({ ok: true, narrative });
}
