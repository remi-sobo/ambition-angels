"use client";

import StageBoard from "@/app/admin/_components/StageBoard";
import { money } from "@/app/admin/finance/_components/charts";
import { OpportunityCard } from "./PipelineBoard";
import { PIPELINE_STAGES, STAGE_LABELS, type OpportunityRow } from "./pipeline-stages";

/**
 * Major Gifts pipeline as a drag-and-drop board. Built on the shared
 * <StageBoard>: drag an ask to another stage column to advance it (PATCH
 * /api/admin/opportunities/:id). The rich per-card actions (edit, lost,
 * brief) stay on OpportunityCard; only the old ◀/▶ stage buttons are gone,
 * replaced by drag.
 *
 * Lost / closed-lost asks are kept off the board entirely (they stay in the
 * DB for reporting, but a moves-management board is forward-looking — it
 * shows live work, not deals we've already lost). Marking an open ask "Lost"
 * makes it drop off on the next refresh.
 */
export default function OpportunitiesBoard({ opps }: { opps: OpportunityRow[] }) {
  const open = opps.filter((o) => o.stage !== "lost");

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
    />
  );
}
