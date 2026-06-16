import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { constituentName } from "@/lib/fundraising/display";

// Gifts CSV export (Epic E reporting). Filters mirror the reports page:
//   from / to   gift_date range (YYYY-MM-DD, inclusive)
//   campaign_id / fund_id / appeal_id   attribution
//   method      card | cash | check | ach | in_kind | stock | other
// Audited like the donor export — money data leaving the system.

const CEILING = 10000;
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  const campaignId = p.get("campaign_id") ?? "";
  const fundId = p.get("fund_id") ?? "";
  const appealId = p.get("appeal_id") ?? "";
  const method = p.get("method") ?? "";

  const supabase = createServerSupabase();
  let query = supabase
    .from("gifts")
    .select(
      "id, amount, gift_date, method, campaign_id, fund_id, appeal_id, constituent:constituents ( type, first_name, last_name, org_name )"
    )
    .order("gift_date", { ascending: false })
    .limit(CEILING);
  if (isDate(from)) query = query.gte("gift_date", from);
  if (isDate(to)) query = query.lte("gift_date", to);
  if (isUuid(campaignId)) query = query.eq("campaign_id", campaignId);
  if (isUuid(fundId)) query = query.eq("fund_id", fundId);
  if (isUuid(appealId)) query = query.eq("appeal_id", appealId);
  if (method) query = query.eq("method", method);

  const { data, error } = await query;
  if (error) {
    console.error("[gifts export] query failed:", error.message);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  // Resolve attribution names once.
  const [camps, funds, appeals] = await Promise.all([
    supabase.from("campaigns").select("id, name"),
    supabase.from("funds").select("id, name"),
    supabase.from("appeals").select("id, name"),
  ]);
  const nameMap = (rows: Array<{ id: string; name: string }> | null) =>
    new Map((rows ?? []).map((r) => [r.id, r.name]));
  const campMap = nameMap(camps.data);
  const fundMap = nameMap(funds.data);
  const appealMap = nameMap(appeals.data);

  const header = ["date", "donor", "amount", "method", "campaign", "fund", "appeal"];
  const lines = [header.join(",")];
  for (const g of (data ?? []) as unknown as Array<{
    amount: number; gift_date: string; method: string;
    campaign_id: string | null; fund_id: string | null; appeal_id: string | null;
    constituent: { type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
  }>) {
    lines.push(
      [
        csvCell(g.gift_date),
        csvCell(g.constituent ? constituentName(g.constituent) : "Anonymous"),
        csvCell(Number(g.amount).toFixed(2)),
        csvCell(g.method),
        csvCell(g.campaign_id ? campMap.get(g.campaign_id) ?? "" : ""),
        csvCell(g.fund_id ? fundMap.get(g.fund_id) ?? "" : ""),
        csvCell(g.appeal_id ? appealMap.get(g.appeal_id) ?? "" : ""),
      ].join(",")
    );
  }

  await audit(req, {
    action: "fundraising.gifts.export",
    entityType: "gifts",
    after: { filters: { from, to, campaign_id: campaignId, fund_id: fundId, appeal_id: appealId, method }, rows: (data ?? []).length },
  });

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gifts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
