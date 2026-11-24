import { NextRequest, NextResponse } from "next/server";
import { syncAllSiteSignals } from "@/lib/siteSignals/server";

/**
 * Daily website numbers (specs/bloomos-repo-split.md §6e item 5): for every
 * org with aa.site_signals and a saved stats feed, pull the days since the
 * last sync (the whole history on the first run) into metric_snapshots.
 * Safe to re-run: snapshots upsert on (metric_id, captured_on).
 *
 * Auth via Bearer CRON_SECRET, the house cron convention.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await syncAllSiteSignals();
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
