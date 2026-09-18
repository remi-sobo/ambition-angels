import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * Attributing money to a gift table (specs/fundraising-gift-tables.md,
 * Phase 3 · Money attribution).
 *
 * Money fills a table automatically only when it is TRACEABLE: an opportunity
 * linked to a placement here, a campaign linked to this table, or a row in
 * this table. Everything else is a possible match, and stays a suggestion
 * until a human attaches it. A gap that closes because software guessed is a
 * gap nobody went and worked.
 *
 * This route writes the third case. The org-match trigger on
 * fr_gift_table_credits resolves source_id in whichever table source_type
 * names and rejects a cross-tenant or non-existent one, so the checks here
 * are for the message, not for the safety.
 */

const SOURCE_TYPES = ["gift", "pledge", "recurring_plan", "grant"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

/** POST — attach a possible match. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const sourceType = body.source_type as SourceType;
  if (!SOURCE_TYPES.includes(sourceType)) {
    return NextResponse.json({ error: "Unknown money source" }, { status: 400 });
  }
  if (typeof body.source_id !== "string") {
    return NextResponse.json({ error: "Missing source" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: table } = await supabase
    .from("fr_gift_tables")
    .select("id, org_id, status")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });
  if (table.status === "closed" || table.status === "archived") {
    return NextResponse.json(
      { error: "A closed table's attribution is frozen" },
      { status: 409 },
    );
  }

  const insert = {
    gift_table_id: table.id,
    org_id: table.org_id,
    source_type: sourceType,
    source_id: body.source_id,
    placement_id: typeof body.placement_id === "string" ? body.placement_id : null,
    attributed_by: (await getAdminUser()) ?? null,
    note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null,
  };

  const { data: row, error } = await supabase
    .from("fr_gift_table_credits")
    .insert(insert)
    .select("id")
    .single();
  if (error) {
    // One credit per source per table.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That money is already attributed to this table." },
        { status: 409 },
      );
    }
    console.error("Attach credit failed:", error.message);
    return NextResponse.json({ error: "Could not attach that money" }, { status: 500 });
  }

  // A source credited to two tables with overlapping windows is allowed (a
  // year-end push nested inside an annual table is legitimate), but both
  // tables should say so rather than quietly double-counting.
  const { data: others } = await supabase
    .from("fr_gift_table_credits")
    .select("gift_table_id")
    .eq("org_id", table.org_id)
    .eq("source_type", sourceType)
    .eq("source_id", body.source_id)
    .neq("gift_table_id", table.id);

  await audit(req, {
    action: "fundraising.gift_table.credit.attach",
    entityType: "fr_gift_table",
    entityId: table.id,
    after: insert,
  });
  return NextResponse.json({
    id: row.id,
    also_credited_to: (others ?? []).length,
  });
}

/** DELETE — detach. The money is untouched; only this table's claim on it. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const creditId = req.nextUrl.searchParams.get("credit_id");
  if (!creditId) return NextResponse.json({ error: "Missing credit_id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: table } = await supabase
    .from("fr_gift_tables")
    .select("id, status")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });
  if (table.status === "closed" || table.status === "archived") {
    return NextResponse.json({ error: "A closed table's attribution is frozen" }, { status: 409 });
  }

  const { data: row, error } = await supabase
    .from("fr_gift_table_credits")
    .delete()
    .eq("id", creditId)
    .eq("gift_table_id", table.id)
    .select("id, source_type, source_id")
    .maybeSingle();
  if (error) {
    console.error("Detach credit failed:", error.message);
    return NextResponse.json({ error: "Could not detach that money" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "Attribution not found" }, { status: 404 });

  await audit(req, {
    action: "fundraising.gift_table.credit.detach",
    entityType: "fr_gift_table",
    entityId: table.id,
    before: { source_type: row.source_type, source_id: row.source_id },
    after: null,
  });
  return NextResponse.json({ ok: true });
}
