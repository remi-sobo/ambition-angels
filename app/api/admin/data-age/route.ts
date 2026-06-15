import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin/auth";
import { getDataAge } from "@/lib/admin/dataAge";

// Thin wrapper over the data-age source of truth (lib/admin/dataAge.ts) so the
// client sidebar can render the loud staleness indicator. Server code (e.g. the
// Phase 4 briefing engine) imports getDataAge() directly instead.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getDataAge());
}
