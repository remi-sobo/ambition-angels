/**
 * GET /api/admin/constituents/search?q= — typeahead for picking an existing
 * constituent (Strategy add-funder, and reusable elsewhere). Name/org match,
 * archived excluded. Prefer picking a result over free-text to avoid
 * duplicates. User-session client (RLS).
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
    .select("id, type, first_name, last_name, org_name, emails, external_ids")
    .or(`first_name.ilike.${like},last_name.ilike.${like},org_name.ilike.${like}`)
    .is("archived_at", null)
    .limit(10);
  if (error) {
    console.error("[constituents/search]", error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const results = (
    (data ?? []) as Array<{
      id: string;
      type: string;
      first_name: string | null;
      last_name: string | null;
      org_name: string | null;
      emails: string[] | null;
      external_ids: Record<string, unknown> | null;
    }>
  ).map((c) => ({
    id: c.id,
    name: constituentName(c),
    type: c.type,
    email: c.emails?.[0] ?? null,
    hasHubspot: typeof c.external_ids?.["hubspot"] === "string",
  }));

  return NextResponse.json({ results });
}
