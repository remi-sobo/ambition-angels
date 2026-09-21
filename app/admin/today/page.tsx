import Link from "next/link";
import EmptyState from "../_components/EmptyState";
import PageHeader from "../_components/PageHeader";
import Metric from "../_components/Metric";
import PageShell from "../_components/ui/PageShell";
import Card, { CardHeader, CardMetric, CardFooter } from "../_components/ui/Card";
import Badge from "../_components/ui/Badge";
import NeedsYou from "./_components/NeedsYou";
import { getTodayData } from "@/lib/admin/today";
import { parseNeedsYouView } from "@/lib/admin/todayRank";
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

/**
 * Visual System V3 §8 — "Money Health, Mission Health, My Day and similar
 * cards should share one consistent card architecture."
 *
 * Today's local `Tile` (a hand-rolled outlined box with an uppercase
 * letter-spaced eyebrow) is gone; every panel on this screen is now the shared
 * <Card> with a <CardHeader>, so it is typeset, padded, bordered and radiused
 * identically to a card anywhere else in the product.
 */
function Tile({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} action={action} />
      {children}
    </Card>
  );
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams?: { needs?: string | string[] };
}) {
  // Needs-you view lives in the URL (?needs=mine|unassigned|all) so the
  // choice survives a refresh; anything else — including no param — is
  // "mine", the per-user default.
  const needsParam = Array.isArray(searchParams?.needs) ? searchParams?.needs[0] : searchParams?.needs;
  const needsView = parseNeedsYouView(needsParam);
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <PageShell>
        <h1 className={TYPE.pageTitle}>Today</h1>
        <p className={`${TYPE.bodyMuted} mt-1.5`}>Sign in to see what needs you.</p>
      </PageShell>
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
    // V3 §8: the workspace was capped near 1100px, which left a wide dead
    // gutter on desktop while the Needs-you column stayed cramped. PageShell
    // takes it to 1280px, and the column gap comes off the §9 spacing scale.
    <PageShell>
      <PageHeader eyebrow={dateLine} title="Today" subtitle={data.orientation.line} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <Tile title="Needs you">
            <NeedsYou
              obligations={data.obligations}
              today={data.todayISO}
              userId={data.userId}
              view={needsView}
            />
          </Tile>
        </div>

        <div className="space-y-4">
          {fin && fresh && (
            <Tile title="Money health">
              {/* Slots 2+3: the key number and its supporting metadata. */}
              <CardMetric
                value={
                  fin.runwayMonths != null ? fmtMetricValue("months", fin.runwayMonths) : "—"
                }
                unit="runway"
                meta={`${fmtMetricValue("usd", fin.cashOnHand)} on hand · burn ${fmtMetricValue("usd", fin.burn3mo)}/mo`}
              />
              {/* Slot 4: status. The freshness chip used an off-palette
                  amber-50/amber-700 pair at 10px uppercase; it is now a
                  house Badge on the semantic warning tone. */}
              <CardFooter
                status={
                  <Badge tone={fresh.stale ? "warning" : "success"}>{fresh.label}</Badge>
                }
              />
            </Tile>
          )}

          <Tile title="Mission health">
            {missionKeys.length === 0 ? (
              <EmptyState
                label="program metrics"
                hint="Mission health reads the Metric Catalog. Define a program metric and it shows here."
                action={
                  <Link
                    href="/admin/impact/kpis"
                    className="text-sm font-semibold text-orange hover:text-orange-dark"
                  >
                    Open the Metric Catalog →
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
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
              <p className={TYPE.bodyMuted}>No events on your calendar today.</p>
            ) : (
              <ul className="space-y-2">
                {data.myDay.events.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-3 text-sm">
                    <span className="shrink-0 tabular-nums text-ink-2 w-[60px]">
                      {e.allDay ? "All day" : fmtTime(e.start)}
                    </span>
                    <span className="truncate text-ink-1">{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.myDay.pendingDrafts > 0 && (
              <CardFooter
                action={
                  <Link
                    href="/admin/inbox"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange hover:text-orange-dark"
                  >
                    {data.myDay.pendingDrafts} draft
                    {data.myDay.pendingDrafts === 1 ? "" : "s"} awaiting your approval →
                  </Link>
                }
              />
            )}
          </Tile>
        </div>
      </div>
    </PageShell>
  );
}
