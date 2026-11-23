import Link from "next/link";
import ResearchDrawerShell from "./ResearchDrawerShell";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import ProspectBench from "../../prospects/ProspectBench";
import { TYPE } from "@/lib/admin/typeScale";

// Spec Fundraising, stage F4 — the R1 prospect-research drawer (signed):
// full-height off Donors & Funders, gated ai.prospect_research by the page
// that renders it. Deliberately NOT a sixth tab — only AA and YGB hold the
// key, and a tab present for two of four orgs makes the row a different
// width per tenant (the ruling's own words).
//
// URL-driven like everything else in this destination: ?drawer=research
// opens it, closing navigates to the URL without the param, so a shared link
// opens the same drawer. The frame is the kit Drawer (ResearchDrawerShell). Contents: the bench (ProspectBench, the V1
// prospects page's extracted body) and the R6 fold-in — the funder-angle
// briefs listed compactly, each linking its live per-angle funnel. The
// Strategy Room EDITOR stays at /admin/fundraising/strategy (NO_HOME row,
// reachable, unlisted): R6 folds the briefs in here, not the public-site
// editing tool.

export default async function ResearchDrawer({
  searchParams,
  closeHref,
}: {
  searchParams?: { show?: string };
  closeHref: string;
}) {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();

  // R6: the funder-angle briefs, folded in as a compact strip.
  const [{ data: angleRows }, { data: faRows }] = await Promise.all([
    supabase
      .from("strategy_angles")
      .select("id, key, name, status_badge, is_active")
      .eq("org_id", ctx.orgId)
      .order("sort_order", { ascending: true })
      .limit(50),
    supabase.from("funder_angles").select("angle_id").eq("org_id", ctx.orgId).limit(2000),
  ]);
  const counts = new Map<string, number>();
  for (const r of (faRows ?? []) as { angle_id: string }[]) {
    counts.set(r.angle_id, (counts.get(r.angle_id) ?? 0) + 1);
  }
  const angles = ((angleRows ?? []) as Array<{
    id: string; key: string; name: string; status_badge: string | null; is_active: boolean;
  }>).filter((a) => a.is_active);

  return (
    <ResearchDrawerShell closeHref={closeHref}>
        <div className="space-y-6">
          {/* ── R6: funder-angle briefs ── */}
          {angles.length > 0 && (
            <section>
              <div className="flex items-baseline gap-3 mb-2">
                <h2 className={TYPE.cardTitle}>Angles</h2>
                <span className="text-xs text-ink-3">
                  framing briefs · each opens its funder funnel
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {angles.map((a) => (
                  <Link
                    key={a.id}
                    href={`/admin/fundraising/strategy/${a.key}`}
                    className="inline-flex items-center gap-2 bg-tile border-hairline rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2 hover:text-orange transition-colors"
                  >
                    {a.name}
                    <span className="text-xs text-ink-3 [font-variant-numeric:tabular-nums]">
                      {counts.get(a.id) ?? 0}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── The bench ── */}
          <ProspectBench
            searchParams={searchParams}
            drawer
            basePath="/admin/fundraising/donors-funders"
            extraParams={{ drawer: "research" }}
          />
        </div>
    </ResearchDrawerShell>
  );
}
