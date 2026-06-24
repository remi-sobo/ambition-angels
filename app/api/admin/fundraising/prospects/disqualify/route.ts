/**
 * POST /api/admin/fundraising/prospects/disqualify — drop prospects off the
 * working bench (or requalify them). Flips fr_prospects.status between
 * 'disqualified' and 'active'; the Prospects list shows only active rows. Fully
 * reversible. Never touches the HubSpot mirror.
 *
 * Body: { prospect_ids: string[] (or prospect_id: string), disqualified: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { prospect_ids?: unknown; prospect_id?: unknown; disqualified?: unknown }
    | null;

  const list = Array.isArray(body?.prospect_ids)
    ? body!.prospect_ids
    : typeof body?.prospect_id === "string"
    ? [body!.prospect_id]
    : [];
  const ids = list.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ error: "No prospect ids" }, { status: 400 });
  if (typeof body?.disqualified !== "boolean") {
    return NextResponse.json({ error: "disqualified (boolean) required" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("fr_prospects")
    .update({ status: body.disqualified ? "disqualified" : "active", updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, [body.disqualified ? "disqualified" : "requalified"]: ids.length });
}
