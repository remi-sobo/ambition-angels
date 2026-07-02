/**
 * GET /api/admin/funders/search?q= — typeahead for picking a funder when
 * creating/editing a grant or logging an ask. A funder is a constituent —
 * usually an organization (foundation, company), sometimes a person (a
 * major-gift ask). Organizations are surfaced first so the common case (grant
 * funder) is one keystroke away; picking a result rather than free-texting a
 * name is what keeps us from spawning duplicate funder records. User-session
 * client, so RLS (fundraising.read) governs the read.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Strip characters that would break the PostgREST or() filter grammar.
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[(),*%]/g, " ").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = createServerSupabase();
  const like = `%${q}%`;
  const { data, error } = await supabase
    .from("constituents")
    .select("id, type, first_name, last_name, org_name")
    .or(`org_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
    .is("archived_at", null)
    .limit(12);
  if (error) {
    console.error("[funders/search]", error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
  }>;

  const results = rows
    .map((c) => ({ id: c.id, type: c.type, name: constituentName(c) }))
    // Organizations first (the usual funder), then people, then by name.
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "organization" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({ results });
}
