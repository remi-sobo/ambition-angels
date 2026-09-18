import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { loadPools } from "@/lib/fundraising/gift-table-server";

/**
 * Candidate pools for a gift table (specs/fundraising-gift-tables.md,
 * Phase 3 · Candidate pools).
 *
 * The loading and the pool rules moved into lib/fundraising/gift-table-server.ts
 * in Phase 5, because the exported workbook needs the same candidates. What is
 * left here is the HTTP shape: auth, the table lookup, and the cap.
 *
 * Fetched on demand rather than with the page: the pools read across
 * constituents, opportunities, gifts, pledges, recurring plans and the bench,
 * and AA alone carries thousands of constituents. The spec's "Rollup cost"
 * failure mode is exactly this query, so it stays off the first paint and
 * behind the drawer that actually needs it.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data: table } = await supabase
    .from("fr_gift_tables")
    .select("id, starts_on, ends_on")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });

  const result = await loadPools(
    supabase,
    ctx.orgId,
    table.id as string,
    { startsOn: table.starts_on as string, endsOn: table.ends_on as string },
    new Date().toISOString().slice(0, 10),
  );

  // Each pool is capped for the drawer. The counts are the honest totals.
  const capped = Object.fromEntries(
    Object.entries(result).map(([key, rows]) => [
      key,
      { total: rows.length, rows: rows.slice(0, 50) },
    ]),
  );
  return NextResponse.json({ pools: capped });
}
