import Link from "next/link";
import EmptyState from "../_components/EmptyState";
import PageHeader from "../_components/PageHeader";
import Metric from "../_components/Metric";
import NeedsYou from "./_components/NeedsYou";
import { getTodayData } from "@/lib/admin/today";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { fmtMetricValue } from "@/lib/admin/metrics/format";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Spec Home, stage H1 — Today: the one door that replaces five.
 *
 * Panels bind to the landed platform (spec §Architecture): Needs-you reads
 * v_obligations (Contract 3) with the pure ranking rule and the A3 RPCs as
 * its only write path; Money reads the canonical getFinanceSnapshot and
 * shows its freshness HONESTLY ("stale, flagged" is the designed default
 * until a fresher cash anchor lands); Mission renders through the <Metric>
 * primitive (Contract 2 — a flagged number renders flagged); My day reads
 * the user's calendar + pending Reed drafts. Recent movement is deferred
 * (open decision 2, resolved).
 *
 * No cutover in this stage: the screen is reachable by URL only; the shell
 * still links /admin until H3 activates the map rows.
 */
export const dynamic = "force-dynamic";

const MISSION_PREFERENCE = [
  "attendance_rate",
  "enrolled_in_cohort",
  "reached_all_time",
  "active_on_platform",
];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** The cash anchor's honesty chip: fresh within 4 days, else stale-flagged. */
function freshness(reconciledAt: string | null): { label: string; stale: boolean } {
  if (!reconciledAt) return { label: "no cash anchor set", stale: true };
  const days = Math.floor((Date.now() - new Date(reconciledAt).getTime()) / 86400000);
  if (days <= 4) return { label: `anchor ${days === 0 ? "updated today" : `${days}d old`}`, stale: false };
  return { label: `stale: anchor from ${reconciledAt.slice(0, 10)}`, stale: true };
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-outline bg-white/50 p-4">
      <h2 className={`${TYPE.sectionHeader} mb-3`}>{title}</h2>
      {children}
    </section>
  );
}

export default async function TodayPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <h1 className={TYPE.pageTitle}>Today</h1>
        <p className="text-ink-2 mt-1">Sign in to see what needs you.</p>
      </div>
    );
  }

  const [data, ents] = await Promise.all([getTodayData(), getEntitlements(ctx.orgId)]);
  if (!data) return null;
  const showFinance = hasFeature(ents, "modules.finance");
  const fin = showFinance ? await getFinanceSnapshot() : null;
  const fresh = fin ? freshness(fin.cfg.reconciledAt) : null;

  // Mission keys: the org's own program metrics, preferred keys first — chosen
  // FROM the catalog, so <Metric> never renders a refusal chip here.
  const catalog = await getMetricCatalog();
  const program = catalog.filter((m) => m.active && m.department === "program");
  const missionKeys = [
    ...MISSION_PREFERENCE.filter((k) => program.some((m) => m.metric_key === k)),
    ...program.map((m) => m.metric_key).filter((k) => !MISSION_PREFERENCE.includes(k)),
  ].slice(0, 3);

  const dateLine = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1100px]">
      <PageHeader eyebrow={dateLine} title="Today" subtitle={data.orientation.line} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Tile title="Needs you">
            <NeedsYou obligations={data.obligations} today={data.todayISO} />
          </Tile>
        </div>

        <div className="space-y-4">
          {fin && fresh && (
            <Tile title="Money health">
              <div className="flex items-baseline gap-2">
                <span className="font-heading font-bold text-2xl tabular-nums text-ink-1">
                  {fin.runwayMonths != null ? fmtMetricValue("months", fin.runwayMonths) : "—"}
                </span>
                <span className={TYPE.metadata}>runway</span>
              </div>
              <p className="text-[12px] text-ink-2 mt-1">
                {fmtMetricValue("usd", fin.cashOnHand)} on hand · burn {fmtMetricValue("usd", fin.burn3mo)}/mo
              </p>
              <span
                className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-heading font-semibold uppercase tracking-wide ${
                  fresh.stale ? "bg-amber-50 text-amber-700" : "bg-revenue-bg text-revenue"
                }`}
              >
                {fresh.label}
              </span>
            </Tile>
          )}

          <Tile title="Mission health">
            {missionKeys.length === 0 ? (
              <EmptyState
                label="program metrics"
                hint="Mission health reads the Metric Catalog. Define a program metric and it shows here."
                action={
                  <Link href="/admin/impact/kpis" className="text-xs font-semibold text-orange hover:text-orange-dark">
                    Open the Metric Catalog →
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2">
                {missionKeys.map((key) => (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <Metric metricKey={key} showName />
                  </li>
                ))}
              </ul>
            )}
          </Tile>

          <Tile title="My day">
            {data.myDay.events.length === 0 ? (
              <p className="text-[12px] text-ink-2">No events on your calendar today.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.myDay.events.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-[13px]">
                    <span className="shrink-0 tabular-nums text-ink-2">
                      {e.allDay ? "All day" : fmtTime(e.start)}
                    </span>
                    <span className="truncate text-ink-1">{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.myDay.pendingDrafts > 0 && (
              <Link
                href="/admin/inbox"
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-orange hover:text-orange-dark"
              >
                {data.myDay.pendingDrafts} draft{data.myDay.pendingDrafts === 1 ? "" : "s"} awaiting your approval →
              </Link>
            )}
          </Tile>
        </div>
      </div>
    </div>
  );
}
