"use client";

import StageBoard from "@/app/admin/_components/StageBoard";
import { money } from "@/app/admin/finance/_components/charts";
import { OpportunityCard } from "./PipelineBoard";
import { type OpportunityRow } from "./pipeline-stages";
import { type PipelineStage } from "@/lib/fundraising/stages";

/**
 * Major Gifts pipeline as a drag-and-drop board. Built on the shared
 * <StageBoard>: drag an ask to another stage column to advance it (PATCH
 * /api/admin/opportunities/:id). The rich per-card actions (edit, lost,
 * brief) stay on OpportunityCard.
 *
 * Columns come from the per-org `pipeline_stages` config the server page
 * loads — ten HubSpot-mirrored stages for the Sales pipeline (Identified →
 * On Hold), the legacy five for the others. The board scrolls horizontally
 * when the columns outgrow the viewport. Terminal columns (Closed Won /
 * Closed Lost) are part of the config and render like any other; the server
 * page scopes their cards to the selected year so they don't pile up forever.
 */
export default function OpportunitiesBoard({
  opps,
  stages,
}: {
  opps: OpportunityRow[];
  stages: PipelineStage[];
}) {
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
      columns={stages.map((s) => ({ key: s.key, label: s.label }))}
      items={opps}
      getItemId={(o) => o.id}
      getItemColumn={(o) => o.stage}
      onMove={onMove}
      columnSummary={(items) =>
        `${items.length} · ${money(items.reduce((s, o) => s + (o.askAmount ?? 0), 0))}`
      }
      minColWidth={150}
      minBoardWidth={Math.max(900, stages.length * 158)}
      maxVisible={12}
      emptyHint="Empty"
      renderCard={(o) => <OpportunityCard opp={o} stages={stages} />}
    />
  );
}
