import Link from "next/link";
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
// opens it, the close link drops the param — no client state, so a shared
// link opens the same drawer. Contents: the bench (ProspectBench, the V1
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
    <>
      {/* Scrim — a link, so closing is a navigation like opening. */}
      <Link href={closeHref} aria-label="Close research drawer" className="fixed inset-0 z-40 bg-black/50" />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl bg-ink border-l-[1.5px] border-outline overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-tile border-b border-outline px-5 py-3 flex items-center gap-3">
          <span className={TYPE.cardTitle}>Prospect Research</span>
          <span className="text-[10px] uppercase tracking-wider text-ink-3">ai.prospect_research</span>
          <Link
            href={closeHref}
            className="ml-auto text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors"
          >
            Close ✕
          </Link>
        </div>

        <div className="px-5 py-5 space-y-6">
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
                    className="inline-flex items-center gap-2 bg-tile border-[1.5px] border-outline rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2 hover:text-orange transition-colors"
                  >
                    {a.name}
                    <span className="text-[10px] text-ink-3 [font-variant-numeric:tabular-nums]">
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
      </aside>
    </>
  );
}
