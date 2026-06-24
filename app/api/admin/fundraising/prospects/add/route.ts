/**
 * POST /api/admin/fundraising/prospects/add — manually add a prospect to the
 * bench (fr_prospects). The simplest intake: someone you know is worth tracking,
 * no HubSpot record needed. They land active and can be rated/researched/promoted.
 *
 * Body: { name (req), type?, email?, org_name?, strategy_note? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const TYPES = ["individual", "foundation", "corporate", "unknown"] as const;

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const type = TYPES.includes(body.type as (typeof TYPES)[number]) ? (body.type as string) : "individual";
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  const org_name = typeof body.org_name === "string" && body.org_name.trim() ? body.org_name.trim() : null;
  const strategy_note =
    typeof body.strategy_note === "string" && body.strategy_note.trim() ? body.strategy_note.trim().slice(0, 1000) : null;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("fr_prospects")
    .insert({
      type,
      source: "manual",
      name: name.slice(0, 200),
      email,
      org_name,
      strategy_note,
      status: "active",
      created_by: await getAdminUser(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[prospects/add] insert failed:", error?.message);
    return NextResponse.json({ error: "Could not add prospect" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
