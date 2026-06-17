/**
 * POST /api/admin/fundraising/prospects/disqualify — drop one or more prospects
 * off the working Prospects list (or re-qualify them). The list is a read-only
 * HubSpot mirror keyed by hubspot_id, so this writes to a suppression set
 * (fr_prospect_disqualified) the list filters against; it never touches the
 * mirror and is fully reversible.
 *
 * Body: { hubspot_ids: string[] (or hubspot_id: string), disqualified: boolean,
 *         reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext, getAdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { hubspot_ids?: unknown; hubspot_id?: unknown; disqualified?: unknown; reason?: unknown }
    | null;

  const list = Array.isArray(body?.hubspot_ids)
    ? body!.hubspot_ids
    : typeof body?.hubspot_id === "string"
    ? [body!.hubspot_id]
    : [];
  const ids = list.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ error: "No hubspot ids" }, { status: 400 });
  if (typeof body?.disqualified !== "boolean") {
    return NextResponse.json({ error: "disqualified (boolean) required" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  if (!body.disqualified) {
    const { error } = await supabase.from("fr_prospect_disqualified").delete().in("hubspot_id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, requalified: ids.length });
  }

  const ctx = await getOrgContext();
  const by = await getAdminUser();
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : null;
  const rows = ids.map((hubspot_id) => ({
    hubspot_id,
    org_id: ctx?.orgId ?? null,
    reason,
    disqualified_by: by,
  }));
  const { error } = await supabase
    .from("fr_prospect_disqualified")
    .upsert(rows, { onConflict: "hubspot_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, disqualified: ids.length });
}
