import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { parseRange, siteDailyStats } from "@/lib/site/stats";

// The website's daily numbers for BloomOS (specs/bloomos-repo-split.md §6e
// item 5). Machine-to-machine: a bearer SITE_STATS_KEY instead of a website
// admin sign-in. Daily totals only (no rows, no handles, no IPs), the same
// figures the website admin home shows.

export const dynamic = "force-dynamic";

function keyMatches(header: string | null): boolean {
  const expected = process.env.SITE_STATS_KEY;
  if (!expected || !header) return false;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!keyMatches(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const range = parseRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"));
  if (!range) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD, from ≤ to, at most 400 days apart" }, { status: 400 });
  }
  try {
    const days = await siteDailyStats(range.from, range.to);
    return NextResponse.json({ from: range.from, to: range.to, days }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[site-admin/stats]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't load the website numbers" }, { status: 500 });
  }
}
