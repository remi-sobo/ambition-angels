"use client";

import StageBoard from "@/app/admin/_components/StageBoard";
import { money } from "@/app/admin/finance/_components/charts";
import { OpportunityCard } from "./PipelineBoard";
import { PIPELINE_STAGES, STAGE_LABELS, type OpportunityRow } from "./pipeline-stages";

/**
 * Major Gifts pipeline as a drag-and-drop board. Built on the shared
 * <StageBoard>: drag an ask to another stage column to advance it (PATCH
 * /api/admin/opportunities/:id). The rich per-card actions (edit, lost,
 * reopen, brief) stay on OpportunityCard; only the old ◀/▶ stage buttons are
 * gone, replaced by drag. Lost asks collapse into the footer.
 */
export default function OpportunitiesBoard({ opps }: { opps: OpportunityRow[] }) {
  const open = opps.filter((o) => o.stage !== "lost");
  const lost = opps.filter((o) => o.stage === "lost");

  async function onMove(id: string, toStage: string) {
    const r = await fetch(`/api/admin/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: toStage }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${r.status}`);
    }
  }

  return (
    <StageBoard<OpportunityRow>
      columns={PIPELINE_STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s] }))}
      items={open}
      getItemId={(o) => o.id}
      getItemColumn={(o) => o.stage}
      onMove={onMove}
      columnSummary={(items) =>
        `${items.length} · ${money(items.reduce((s, o) => s + (o.askAmount ?? 0), 0))}`
      }
      maxVisible={12}
      emptyHint="Empty"
      renderCard={(o) => <OpportunityCard opp={o} />}
      footer={
        lost.length > 0 ? (
          <details>
            <summary className="text-xs text-ink-2 cursor-pointer hover:text-ink-1">
              Lost ({lost.length})
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-3">
              {lost.map((o) => (
                <OpportunityCard key={o.id} opp={o} />
              ))}
            </div>
          </details>
        ) : undefined
      }
    />
  );
}
