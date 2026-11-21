import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAaOnly } from "@/lib/admin/aaOnly";
import { requirePermission } from "@/lib/admin/requirePermission";

// GET /api/admin/fundraising/prospects/hubspot-search?q=&lifecycle=&offset=
// HubSpot mirror contacts NOT already on the bench, for the import picker.
// Backed by the hubspot_bench_candidates SQL functions (anti-join on fr_prospects).
// Those functions take no org argument and read the whole hs_* mirror, which
// is the env HubSpot owner's data, so only that org may search it.
export const dynamic = "force-dynamic";
const PAGE = 50;

export async function GET(req: NextRequest) {
  const guard = await requirePermission("fundraising.read");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const gate = await requireAaOnly("aa.hubspot_mirror");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const lifecycle = (searchParams.get("lifecycle") ?? "").trim();
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const p_search = q.length ? q : null;
  const p_lifecycle = lifecycle.length ? lifecycle : null;

  const supabase = getSupabaseAdmin();
  const [rowsRes, countRes] = await Promise.all([
    supabase.rpc("hubspot_bench_candidates", { p_search, p_lifecycle, p_limit: PAGE, p_offset: offset }),
    // Count only on the first page — it's the expensive part and doesn't change as you page.
    offset === 0
      ? supabase.rpc("hubspot_bench_candidates_count", { p_search, p_lifecycle })
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (rowsRes.error) {
    console.error("[hubspot-search] rpc failed:", rowsRes.error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const rows = (rowsRes.data ?? []) as Array<Record<string, unknown>>;
  return NextResponse.json({
    rows,
    total: offset === 0 ? Number(countRes.data ?? rows.length) : null,
    hasMore: rows.length === PAGE,
    nextOffset: offset + rows.length,
  });
}
