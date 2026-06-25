"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import StageBoard from "@/app/admin/_components/StageBoard";
import { money } from "@/app/admin/finance/_components/charts";
import { STAGE_LABELS } from "../_lib/stages";

// Pipeline columns, in order. Declined/closed are terminal and collapse into
// the footer rather than getting drag columns (decline from the detail page's
// stage dropdown, which still offers every stage).
export const BOARD_STAGES = [
  "prospect",
  "qualified",
  "loi",
  "proposal",
  "submitted",
  "awarded",
  "active",
] as const;

export type GrantCard = {
  id: string;
  name: string;
  stage: string;
  amount_requested: number | null;
  amount_awarded: number | null;
  funderName: string | null;
};

const grantValue = (g: GrantCard) => g.amount_awarded ?? g.amount_requested ?? 0;

/**
 * Drag-and-drop grants pipeline. Built on the shared <StageBoard>: drag a grant
 * to another stage column to advance it (PATCH /api/admin/grants/:id), or click
 * a card to open its workspace. Mirrors the look of the old presentational
 * board; the only new thing is that the columns are live drop targets.
 */
export default function GrantsBoard({
  grants,
  closed,
}: {
  grants: GrantCard[];
  closed: GrantCard[];
}) {
  const router = useRouter();

  async function onMove(id: string, toStage: string) {
    const r = await fetch(`/api/admin/grants/${id}`, {
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
    <StageBoard<GrantCard>
      title="Pipeline"
      columns={BOARD_STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s] }))}
      items={grants}
      getItemId={(g) => g.id}
      getItemColumn={(g) => g.stage}
      onMove={onMove}
      onCardClick={(g) => router.push(`/admin/fundraising/grants/${g.id}`)}
      columnSummary={(items) =>
        `${items.length} · ${money(items.reduce((s, g) => s + grantValue(g), 0))}`
      }
      emptyHint="—"
      renderCard={(g) => (
        <div className="bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline rounded-lg px-2.5 py-2 transition-colors">
          <div className="text-xs font-medium text-ink-1 truncate">{g.name}</div>
          <div className="text-[11px] text-ink-2 truncate">{g.funderName ?? "—"}</div>
          <div className="text-[11px] text-orange font-semibold [font-variant-numeric:tabular-nums]">
            {grantValue(g) > 0 ? money(grantValue(g)) : ""}
          </div>
        </div>
      )}
      footer={
        closed.length > 0 ? (
          <>
            <div className="text-[10px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-2">
              Declined / Closed
            </div>
            <div className="flex flex-wrap gap-2">
              {closed.map((g) => (
                <Link
                  key={g.id}
                  href={`/admin/fundraising/grants/${g.id}`}
                  className="text-xs text-ink-3 hover:text-ink-1 bg-tile border-[1.5px] border-outline rounded-full px-2.5 py-1 transition-colors"
                >
                  {g.name} · {STAGE_LABELS[g.stage]}
                </Link>
              ))}
            </div>
          </>
        ) : undefined
      }
    />
  );
}
