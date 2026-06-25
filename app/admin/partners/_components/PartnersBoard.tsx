"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import StageBoard from "@/app/admin/_components/StageBoard";
import { STATUS_ORDER, STATUS_LABELS } from "../_lib/status";
import { KIND_LABELS, type Partner } from "../_lib/partners";
import { scoreBand, SCORE_BAND_STYLE } from "../_lib/rubric";

// Pipeline columns, in order. Lapsed is the exit state and collapses into the
// footer rather than getting a drag column.
const BOARD_STATUSES = STATUS_ORDER.filter((s) => s !== "lapsed");

/**
 * Drag-and-drop partner pipeline. Built on the shared <StageBoard>: drag a
 * partner to another status column to advance it (PATCH
 * /api/admin/partners/manage/:id), or click a card to open its profile.
 * Receives the already-filtered partner set from the workspace, so search /
 * type / area / task filters apply to the board too.
 */
export default function PartnersBoard({ partners }: { partners: Partner[] }) {
  const router = useRouter();
  const active = partners.filter((p) => p.status !== "lapsed");
  const lapsed = partners.filter((p) => p.status === "lapsed");

  async function onMove(id: string, status: string) {
    const r = await fetch(`/api/admin/partners/manage/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${r.status}`);
    }
  }

  return (
    <StageBoard<Partner>
      columns={BOARD_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] }))}
      items={active}
      getItemId={(p) => p.id}
      getItemColumn={(p) => p.status}
      onMove={onMove}
      onCardClick={(p) => router.push(`/admin/partners/${p.id}`)}
      columnSummary={(items) => `${items.length}`}
      minBoardWidth={1000}
      emptyHint="—"
      renderCard={(p) => <PartnerCardBody partner={p} />}
      footer={
        lapsed.length > 0 ? (
          <>
            <div className="text-[10px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-2">
              Lapsed
            </div>
            <div className="flex flex-wrap gap-2">
              {lapsed.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/partners/${p.id}`}
                  draggable={false}
                  className="text-xs text-ink-3 hover:text-ink-1 bg-tile border-[1.5px] border-outline rounded-full px-2.5 py-1 transition-colors"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </>
        ) : undefined
      }
    />
  );
}

function PartnerCardBody({ partner: p }: { partner: Partner }) {
  const today = new Date().toISOString().slice(0, 10);
  const mouExpired = p.mou_status === "signed" && !!p.mou_end && p.mou_end < today;
  const geo = [p.city, p.region].filter(Boolean).join(", ");
  return (
    <div className="bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline rounded-lg px-2.5 py-2 transition-colors">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-ink-1 truncate flex-1 min-w-0">{p.name}</span>
        {p.priority_score != null && (
          <span
            title="Fit score"
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${SCORE_BAND_STYLE[scoreBand(p.priority_score)]}`}
          >
            {p.priority_score}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <span className="text-[10px] text-ink-2 uppercase tracking-wider">
          {KIND_LABELS[p.kind] ?? p.kind}
        </span>
        {geo && <span className="text-[10px] text-ink-3 truncate">{geo}</span>}
      </div>
      {((typeof p.open_tasks === "number" && p.open_tasks > 0) ||
        p.mou_status === "signed") && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {typeof p.open_tasks === "number" && p.open_tasks > 0 && (
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                p.overdue_tasks ? "bg-expense-bg text-expense" : "bg-orange/15 text-orange"
              }`}
            >
              {p.open_tasks} task{p.open_tasks === 1 ? "" : "s"}
              {p.overdue_tasks ? ` · ${p.overdue_tasks} overdue` : ""}
            </span>
          )}
          {p.mou_status === "signed" && (
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                mouExpired ? "bg-expense-bg text-expense" : "bg-revenue-bg text-revenue"
              }`}
            >
              MOU
            </span>
          )}
        </div>
      )}
    </div>
  );
}
