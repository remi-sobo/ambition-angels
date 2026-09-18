import { NextRequest, NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { loadGiftTableSpine, loadPools, placedNames } from "@/lib/fundraising/gift-table-server";
import { buildWorkbook } from "@/lib/fundraising/gift-table-workbook";

/**
 * Download one gift table as a workbook (specs/fundraising-gift-tables.md,
 * Phase 5, Open decision 10).
 *
 * This route only loads and responds. WHAT the workbook says lives in
 * lib/fundraising/gift-table-workbook.ts so it can be tested without a
 * database, and every number in it comes from the same spine loader the
 * detail page renders — nothing is recomputed for the export.
 *
 * Audited like the gifts and donors exports: money data leaving the system.
 */
export const dynamic = "force-dynamic";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Gift table not found" }, { status: 404 });
  }

  const supabase = createServerSupabase();
  const spine = await loadGiftTableSpine(supabase, ctx.orgId, params.id);
  if (!spine) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });

  const { table } = spine;
  const today = new Date().toISOString().slice(0, 10);
  const pools = await loadPools(
    supabase,
    ctx.orgId,
    table.id,
    { startsOn: table.startsOn, endsOn: table.endsOn },
    today,
  );

  const buffer = await writeXlsxFile(buildWorkbook({ spine, pools, today })).toBuffer();

  await audit(req, {
    action: "fundraising.gift_table.export",
    entityType: "fr_gift_table",
    entityId: table.id,
    after: {
      levels: spine.slots.length,
      names: placedNames(spine).length,
      pools: Object.values(pools).reduce((a, rows) => a + rows.length, 0),
    },
  });

  const slug = table.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  // The repo's other exports are CSV, so this is its first binary response. A
  // Blob is the one BodyInit valid in both the Node and Edge runtimes.
  return new NextResponse(new Blob([new Uint8Array(buffer)], { type: XLSX_TYPE }), {
    headers: {
      "content-type": XLSX_TYPE,
      "content-disposition": `attachment; filename="${slug || "gift-table"}-${today}.xlsx"`,
    },
  });
}
