import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { isTokenEncConfigured } from "@/lib/crypto/secret-box";
import { pacificYesterday, validStatsUrl } from "@/lib/siteSignals/metrics";
import { fetchSiteStats, saveSiteSignalsConfig, syncSiteSignals } from "@/lib/siteSignals/server";

// Settings → Connections → Website numbers (specs/bloomos-repo-split.md §6e
// item 5). Owner/admin only (org.manage), and only for orgs with
// aa.site_signals. The key is checked against the website before it is
// saved, stored encrypted, and never returned or audited.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const gate = () => requirePermission("org.manage", { entitlement: "aa.site_signals" });

/** Save (or replace) the stats feed, then pull the numbers right away. */
export async function PUT(req: NextRequest) {
  const g = await gate();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!isTokenEncConfigured()) {
    return NextResponse.json({ error: "BloomOS can't store keys safely right now. Try again later." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { stats_url?: unknown; key?: unknown } | null;
  const statsUrl = validStatsUrl(body?.stats_url);
  if (!statsUrl) return NextResponse.json({ error: "Enter the stats address, starting with https://", field: "stats_url" }, { status: 400 });
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (key.length < 16 || /\s/.test(key)) return NextResponse.json({ error: "Paste the whole stats key.", field: "key" }, { status: 400 });

  const y = pacificYesterday();
  try {
    await fetchSiteStats({ statsUrl, key }, y, y);
  } catch (err) {
    return NextResponse.json(
      { error: `That didn't work: ${err instanceof Error ? err.message : "the website didn't answer"}. Nothing was saved.` },
      { status: 400 },
    );
  }

  await saveSiteSignalsConfig({ orgId: g.ctx.orgId, savedBy: g.ctx.userId, statsUrl, key });
  await audit(req, { action: "site_signals.connect", entityType: "org", entityId: g.ctx.orgId, after: { stats_url: statsUrl } });
  const sync = await syncSiteSignals(g.ctx.orgId);
  return NextResponse.json({ ok: true, sync });
}

/** Pull now, instead of waiting for the morning run. */
export async function POST() {
  const g = await gate();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const sync = await syncSiteSignals(g.ctx.orgId);
  return NextResponse.json(sync.ok ? { ok: true, sync } : { error: sync.error, sync }, { status: sync.ok ? 200 : 502 });
}
