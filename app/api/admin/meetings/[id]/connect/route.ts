import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, isAuthed } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import { fanOutTimeline } from "@/lib/meetings/match";
import type { MatchedEntity } from "@/lib/meetings/types";

export const dynamic = "force-dynamic";

// GET /api/admin/meetings/[id]/connect?q= — typeahead for manually connecting a
// meeting to a donor (constituent) or partner. User-session client (RLS), so a
// hit is always a row the signed-in admin could already open.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Strip characters that would break the PostgREST or() filter grammar.
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[(),*%]/g, " ").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const sb = createServerSupabase();
  const like = `%${q}%`;

  const [{ data: cons }, { data: parts }] = await Promise.all([
    sb
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, emails")
      .or(`first_name.ilike.${like},last_name.ilike.${like},org_name.ilike.${like}`)
      .is("archived_at", null)
      .limit(8),
    sb.from("partners").select("id, name, kind").ilike("name", like).limit(8),
  ]);

  const results = [
    ...((cons ?? []) as Array<{
      id: string;
      type: string;
      first_name: string | null;
      last_name: string | null;
      org_name: string | null;
      emails: string[] | null;
    }>).map((c) => ({
      type: "constituent" as const,
      id: c.id,
      name: constituentName(c),
      subtitle: c.type === "organization" ? "Organization" : c.emails?.[0] ?? "Donor",
    })),
    ...((parts ?? []) as Array<{ id: string; name: string | null; kind: string | null }>).map((p) => ({
      type: "partner" as const,
      id: p.id,
      name: p.name ?? "Partner",
      subtitle: p.kind ? `Partner · ${p.kind}` : "Partner",
    })),
  ];

  return NextResponse.json({ results });
}

// POST /api/admin/meetings/[id]/connect — manually link this meeting to a donor
// or partner. Writes the same timeline rows the attendee matcher would (so the
// meeting appears on the donor/partner profile), keyed on the meeting record so
// it's idempotent. Org-scoped explicitly.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const entityType = body?.entity_type;
  const entityId = typeof body?.entity_id === "string" ? body.entity_id : "";
  if ((entityType !== "constituent" && entityType !== "partner") || !entityId) {
    return NextResponse.json(
      { error: "entity_type ('constituent'|'partner') and entity_id required" },
      { status: 400 }
    );
  }

  const sb = getSupabaseAdmin();
  const { data: rec } = await sb
    .from("meeting_records")
    .select("id, org_id, title, occurred_at, summary")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const meeting = rec as { id: string; org_id: string; title: string | null; occurred_at: string; summary: string | null };

  // Resolve a display name for the picked entity, org-scoped so we can't link
  // across tenants even with the service-role client.
  let name = "";
  if (entityType === "constituent") {
    const { data } = await sb
      .from("constituents")
      .select("type, first_name, last_name, org_name")
      .eq("id", entityId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Donor not found" }, { status: 404 });
    name = constituentName(data as { type: string; first_name: string | null; last_name: string | null; org_name: string | null });
  } else {
    const { data } = await sb
      .from("partners")
      .select("name")
      .eq("id", entityId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    name = (data as { name: string | null }).name ?? "Partner";
  }

  const entity: MatchedEntity = { type: entityType, id: entityId, name, matchedEmail: null };
  try {
    await fanOutTimeline(sb, meeting, [entity]);
  } catch (e) {
    console.error("[meetings/:id/connect] fan-out failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to connect" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, connected: entity });
}
