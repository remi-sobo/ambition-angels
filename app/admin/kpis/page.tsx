import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeKpis, formatKpi } from "@/lib/kpis";
import { TargetEditor } from "./_components/KpiControls";
import PageHeader from "../_components/PageHeader";

// KPI scorecard (Ring 4, modules/07-governance.md): 12-ish indicators
// computed live from the spine, with targets, RAG status, and a trend vs
// the snapshot from ~4 weeks ago (the Monday cron writes snapshots).
export const dynamic = "force-dynamic";

export default async function KpisPage() {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 21 * 86400_000).toISOString().slice(0, 10);

  const [kpis, settingsRes, snapshotsRes] = await Promise.all([
    computeKpis(supabase),
    supabase.from("kpi_settings").select("metric_key, target, owner, active"),
    supabase
      .from("kpi_snapshots")
      .select("metric_key, captured_on, value")
      .lte("captured_on", cutoff)
      .order("captured_on", { ascending: false })
      .limit(500),
  ]);

  const settings = new Map(
    ((settingsRes.data ?? []) as Array<{
      metric_key: string; target: number | null; owner: string | null; active: boolean;
    }>).map((s) => [s.metric_key, s])
  );
  // Most recent snapshot at least ~3 weeks old per metric = the trend base.
  const oldSnap = new Map<string, number>();
  for (const s of (snapshotsRes.data ?? []) as Array<{ metric_key: string; value: number }>) {
    if (!oldSnap.has(s.metric_key)) oldSnap.set(s.metric_key, Number(s.value));
  }

  const rows = kpis
    .filter((k) => settings.get(k.key)?.active !== false)
    .map((k) => {
      const s = settings.get(k.key);
      const target = s?.target != null ? Number(s.target) : null;
      let rag: "green" | "amber" | "red" | "none" = "none";
      if (target != null && target > 0) {
        const ratio = k.direction === "up" ? k.value / target : target === 0 ? 1 : k.value / target;
        if (k.direction === "up") rag = ratio >= 1 ? "green" : ratio >= 0.9 ? "amber" : "red";
        else rag = k.value <= target ? "green" : k.value <= target * 1.25 ? "amber" : "red";
      } else if (k.direction === "down") {
        // Sensible default for "lower is better" counts: zero is green.
        rag = k.value === 0 ? "green" : "amber";
      }
      const prev = oldSnap.get(k.key);
      const trend =
        prev == null || prev === k.value ? "flat" : k.value > prev ? "up" : "down";
      const trendGood =
        trend === "flat" ? null : (trend === "up") === (k.direction === "up");
      return { k, target, owner: s?.owner ?? null, rag, trend, trendGood, prev };
    });

  const RAG: Record<string, string> = {
    green: "bg-green-500/15 text-green-400",
    amber: "bg-amber-500/15 text-amber-400",
    red: "bg-red-500/15 text-red-400",
    none: "bg-white/5 text-gray-mid",
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-8 max-w-[1000px]">
      <PageHeader
        title="KPIs"
        subtitle="Computed live from the spine — set targets, watch the trend. Snapshots write every Monday; trends compare to ~4 weeks ago."
      />

      <div className="space-y-2">
        {rows.map(({ k, target, owner, rag, trend, trendGood, prev }) => (
          <article
            key={k.key}
            className="bg-[#161926] border border-white/10 rounded-xl p-3 flex flex-wrap items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-cream text-sm">{k.label}</div>
              {k.hint && <div className="text-[11px] text-gray-mid">{k.hint}</div>}
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-cream tabular-nums">
                {formatKpi(k, k.value)}
              </div>
              {prev != null && trend !== "flat" && (
                <div
                  className={`text-[11px] tabular-nums ${
                    trendGood ? "text-green-400" : "text-red-300"
                  }`}
                >
                  {trend === "up" ? "↑" : "↓"} from {formatKpi(k, prev)}
                </div>
              )}
            </div>
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-full uppercase tracking-wider ${RAG[rag]}`}>
              {target != null
                ? `target ${formatKpi(k, target)}`
                : k.direction === "down"
                ? "lower is better"
                : "no target"}
            </span>
            <TargetEditor metricKey={k.key} target={target} owner={owner} />
          </article>
        ))}
      </div>
    </div>
  );
}
