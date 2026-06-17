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

  const constituentRows = (data ?? []) as Array<{
    id: string;
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    emails: string[] | null;
    external_ids: Record<string, unknown> | null;
  }>;
  const results = constituentRows.map((c) => ({
    kind: "constituent" as const,
    id: c.id,
    hubspotId: typeof c.external_ids?.["hubspot"] === "string" ? (c.external_ids["hubspot"] as string) : null,
    name: constituentName(c),
    type: c.type,
    email: c.emails?.[0] ?? null,
  }));

  // Also surface HubSpot mirror prospects that aren't yet on the spine, so a
  // mirror-only funder can be promoted + added. Drop any whose email already
  // matches a constituent result (avoids a duplicate card; promote also
  // dedupes server-side).
  const knownEmails = new Set(results.map((r) => r.email?.toLowerCase()).filter(Boolean));
  const { data: hs } = await supabase
    .from("hs_contacts")
    .select("hubspot_id, first_name, last_name, company, email")
    .or(`first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like},email.ilike.${like}`)
    .limit(10);
  const prospects = ((hs ?? []) as Array<{
    hubspot_id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    email: string | null;
  }>)
    .filter((p) => !(p.email && knownEmails.has(p.email.toLowerCase())))
    .map((p) => ({
      kind: "prospect" as const,
      id: null,
      hubspotId: p.hubspot_id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.company || p.email || "Unknown",
      type: "person",
      email: p.email ?? null,
    }));

  return NextResponse.json({ results: [...results, ...prospects] });
}
