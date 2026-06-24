import { getPipeline } from "@/lib/admin/overview/sources";
import { money } from "../../finance/_components/charts";
import { Widget, Empty } from "./shared";

// HubSpot deal pipeline by stage. NOTE: this is total synced pipeline, not a
// forecast — the CEO cockpit's GoalForecastWidget (Phase 2) is the curated
// "committed + weighted-open vs goal" view. This stays available as a raw
// pipeline reference.

export default async function PipelineWidget({ className }: { className?: string }) {
  const { stages, total } = await getPipeline();

  return (
    <Widget title="Fundraising Pipeline" href="/admin/fundraising" hrefLabel="Pipeline" className={className}>
      {stages.length === 0 ? (
        <Empty>No deals synced yet. Run a HubSpot sync from the sidebar to populate the pipeline.</Empty>
      ) : (
        <>
          <div className="mb-4">
            <span className="font-heading font-semibold text-ink-1 text-xl [font-variant-numeric:tabular-nums]">{money(total)}</span>
            <span className="text-xs text-ink-2 ml-2">total pipeline</span>
          </div>
          <div className="space-y-3">
            {stages.map((s) => {
              const pct = total > 0 ? Math.max((s.total / total) * 100, 2) : 2;
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ink-1 font-medium truncate">{s.stage}</span>
                    <span className="text-ink-2 whitespace-nowrap ml-2 [font-variant-numeric:tabular-nums]">
                      {s.count} · {money(s.total)}
                    </span>
                  </div>
                  <div className="h-2 bg-tile rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-orange" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Widget>
  );
}
