import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { generateBriefing } from "@/lib/briefing";

// POST — generate a fresh on-demand briefing (gather → narrate → store).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await generateBriefing(getSupabaseAdmin(), "on_demand");
  await audit(req, {
    action: "briefing.generate",
    entityType: "briefing",
    after: { model: result.model, headline: result.headline },
  });
  return NextResponse.json({ ok: true, narrated: !!result.narrative });
}
