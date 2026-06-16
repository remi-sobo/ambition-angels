import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// CSV export of constituents, filterable by the segment definition keys:
//   q          name/org contains
//   type       person | organization
//   source     constituents.source (stripe | hubspot_import | manual | …)
//   tag        tags contains
//   min_total  lifetime giving >= N
//   since      gave on/after YYYY-MM-DD
//
// Exports are audited (action fundraising.donors.export) — donor lists
// leaving the system is exactly what the audit ledger is for.

const CEILING = 10000; // constituents + gift rows fetched; revisit at scale

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const p = req.nextUrl.searchParams;
  const q = p.get("q")?.trim() ?? "";
  const type = p.get("type")?.trim() ?? "";
  const source = p.get("source")?.trim() ?? "";
  const tag = p.get("tag")?.trim() ?? "";
  const minTotal = Number(p.get("min_total") ?? "") || 0;
  const since = /^\d{4}-\d{2}-\d{2}$/.test(p.get("since") ?? "") ? p.get("since")! : "";

  const supabase = createServerSupabase();
  let query = supabase
    .from("constituents")
    .select(
      "id, type, first_name, last_name, org_name, emails, phones, tags, source, do_not_contact, external_ids"
    )
    .limit(CEILING);
  if (type === "person" || type === "organization") query = query.eq("type", type);
  if (source) query = query.eq("source", source);
  if (tag) query = query.contains("tags", [tag]);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ").trim();
    if (safe) {
      query = query.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,org_name.ilike.%${safe}%`
      );
    }
  }
  const { data: constituents, error } = await query;
  if (error) {
    console.error("Export query failed:", error.message);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  // Aggregate giving in memory (AA-scale; CEILING guards the fetch).
  const { data: gifts } = await supabase
    .from("gifts")
    .select("constituent_id, amount, gift_date")
    .not("constituent_id", "is", null)
    .limit(CEILING);
  const agg = new Map<string, { total: number; count: number; last: string }>();
  for (const g of gifts ?? []) {
    const id = g.constituent_id as string;
    const cur = agg.get(id) ?? { total: 0, count: 0, last: "" };
    cur.total += Number(g.amount);
    cur.count += 1;
    if (g.gift_date > cur.last) cur.last = g.gift_date;
    agg.set(id, cur);
  }

  const rows = (constituents ?? [])
    .map((c) => {
      const a = agg.get(c.id) ?? { total: 0, count: 0, last: "" };
      return { c, a };
    })
    .filter(({ a }) => a.total >= minTotal)
    .filter(({ a }) => !since || (a.last && a.last >= since));

  const header = [
    "name", "type", "emails", "phones", "tags", "source", "do_not_contact",
    "lifetime_total", "gift_count", "last_gift_date", "hubspot_id",
  ];
  const lines = [header.join(",")];
  for (const { c, a } of rows) {
    const name =
      c.type === "organization"
        ? c.org_name ?? ""
        : [c.first_name, c.last_name].filter(Boolean).join(" ");
    const ext = (c.external_ids ?? {}) as Record<string, unknown>;
    lines.push(
      [
        csvCell(name),
        csvCell(c.type),
        csvCell((c.emails ?? []).join("; ")),
        csvCell((c.phones ?? []).join("; ")),
        csvCell((c.tags ?? []).join("; ")),
        csvCell(c.source),
        csvCell(c.do_not_contact ? "yes" : "no"),
        csvCell(a.total.toFixed(2)),
        csvCell(a.count),
        csvCell(a.last),
        csvCell(typeof ext["hubspot"] === "string" ? ext["hubspot"] : ""),
      ].join(",")
    );
  }

  await audit(req, {
    action: "fundraising.donors.export",
    entityType: "constituents",
    after: { filters: { q, type, source, tag, min_total: minTotal, since }, rows: rows.length },
  });

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="donors-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
