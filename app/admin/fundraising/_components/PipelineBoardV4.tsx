"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import StageBoard from "@/app/admin/_components/StageBoard";
import SavedViews from "@/app/admin/_components/ui/SavedViews";
import FilterRow from "@/app/admin/_components/ui/FilterRow";
import Figure, { SummaryStrip } from "@/app/admin/_components/ui/Figure";
import Button from "@/app/admin/_components/ui/Button";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { TYPE } from "@/lib/admin/typeScale";
import {
  firstOpenStageKey,
  stageKeysOfType,
  type PipelineStage,
} from "@/lib/fundraising/stages";
import {
  BOARD_VIEWS,
  QUICK_FILTERS,
  boardSummary,
  quarterEnd,
  cardUrgency,
  columnStats,
  columnsForView,
  filterBoard,
  isBoardView,
  type BoardViewKey,
  type QuickKey,
} from "@/lib/fundraising/pipelineBoard";
import { shortDay, usd } from "@/lib/fundraising/donorRecord";
import OpportunityEditModal from "./OpportunityEditModal";
import OwnerChip from "@/app/admin/_components/OwnerChip";
import { ownerLabel, type OrgMember } from "@/lib/admin/owners";
import type { Me } from "@/lib/admin/todayPanels";
import { type OpportunityRow } from "./pipeline-stages";

/**
 * Pipeline on the Board archetype (V4 B1, Pipeline.dc.html): saved views,
 * one filter row, a summary strip for what is in view, then columns with a
 * count and a total. Each card: the donor, the amount and expected close,
 * the next step with ONE urgency signal, and the owner chip (the member
 * owner, falling back to the ask's older free-text owner). "My asks" is a
 * saved view: owner_id = me, the text owner only where owner_id is null.
 *
 * Moving a card: drag it (the shared StageBoard, kept for mouse and touch),
 * or use the card's "Stage" menu, a native select, so the keyboard and
 * screen readers can move asks too. Both go through saveAction; a failed
 * move puts the card back and says so.
 */
export default function PipelineBoardV4({
  opps,
  stages,
  today,
  initialView,
  me = null,
  members = [],
  canAssign = false,
}: {
  opps: OpportunityRow[];
  stages: PipelineStage[];
  today: string;
  initialView?: string;
  me?: Me | null;
  members?: OrgMember[];
  canAssign?: boolean;
}) {
  const save = useSaveAction();
  const [view, setView] = useState<BoardViewKey>(
    isBoardView(initialView) ? initialView : "all",
  );
  const [quick, setQuick] = useState<QuickKey[]>([]);
  const [q, setQ] = useState("");

  const typeOf = useMemo(() => {
    const m = new Map(stages.map((s) => [s.key, s.stageType as string]));
    return (stage: string) => m.get(stage) ?? "open";
  }, [stages]);

  // The resolved owner name rides along so search finds "Kendra" whether the
  // card is owned by id or only by its old text owner.
  const withNames = useMemo(
    () => opps.map((o) => ({ ...o, ownerName: ownerLabel(o.ownerId, members, o.owner) })),
    [opps, members],
  );
  const shown = useMemo(
    () =>
      filterBoard(withNames, { view, quick, q, me }, typeOf, today) as OpportunityRow[],
    [withNames, view, quick, q, me, typeOf, today],
  );
  const columns = columnsForView(stages, view);
  const stats = columnStats(shown, columns);
  const sum = boardSummary(shown, typeOf, today);
  const onBoard = stats.reduce((n, s) => n + s.count, 0);

  function selectView(k: string) {
    if (!isBoardView(k)) return;
    setView(k);
    // Keep the view in the URL so it survives a refresh and can be shared.
    try {
      const url = new URL(window.location.href);
      if (k === "all") url.searchParams.delete("view");
      else url.searchParams.set("view", k);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* no URL API: the view still applies */
    }
  }

  const toggle = (k: QuickKey) =>
    setQuick((cur) =>
      cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k],
    );

  async function move(id: string, toStage: string): Promise<void> {
    const r = await save({
      request: {
        url: `/api/admin/opportunities/${id}`,
        method: "PATCH",
        body: { stage: toStage },
      },
      failure: false,
    });
    if (!r.ok) throw new Error(r.message);
  }

  return (
    <>
      <SavedViews
        views={BOARD_VIEWS.map((v) => ({ key: v.key, label: v.label }))}
        activeKey={view}
        onSelect={selectView}
        label="Pipeline views"
      />
      <FilterRow
        search={{
          value: q,
          onChange: setQ,
          label: "Search asks",
          placeholder: "Donor, ask or next step",
        }}
        quickFilters={QUICK_FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          active: quick.includes(f.key),
          onClick: () => toggle(f.key),
        }))}
        onClearAll={() => {
          setQuick([]);
          setQ("");
        }}
      />

      <SummaryStrip label="Summary for this view">
        <Figure
          label="Open asks"
          value={usd(sum.openTotal)}
          source={`${sum.openCount} open ask${sum.openCount === 1 ? "" : "s"} in this view, as of now`}
        />
        <Figure
          label="Expected this quarter"
          value={usd(sum.quarterTotal)}
          source={`${sum.quarterCount} ask${sum.quarterCount === 1 ? "" : "s"} with a close date by ${shortDay(quarterEnd(today), today)}`}
        />
        <Figure
          label="Asks with no next step"
          value={sum.noNextStep}
          compare={sum.late > 0 ? `${sum.late} late` : undefined}
          compareTone={sum.late > 0 ? "danger" : "muted"}
          source={
            sum.noNextStep > 0
              ? "Add a next step from the card or the donor record"
              : "Every open ask has a next step"
          }
        />
        <Figure
          label="Won in this view"
          value={usd(sum.wonTotal)}
          source={`${sum.wonCount} ask${sum.wonCount === 1 ? "" : "s"} in a won stage, for the year selected`}
        />
      </SummaryStrip>

      <StageBoard<OpportunityRow>
        columns={columns.map((s) => ({ key: s.key, label: s.label }))}
        items={shown.filter((o) => columns.some((c) => c.key === o.stage))}
        getItemId={(o) => o.id}
        getItemColumn={(o) => o.stage}
        onMove={move}
        columnSummary={(items) => {
          const st = items.length;
          const total = items.reduce((s, o) => s + (o.askAmount ?? 0), 0);
          return (
            <span className="flex flex-col">
              <span>
                {st} ask{st === 1 ? "" : "s"}
              </span>
              <span className="text-ink-1 font-semibold">
                Total {usd(total)}
              </span>
            </span>
          );
        }}
        minColWidth={200}
        minBoardWidth={Math.max(900, columns.length * 212)}
        maxVisible={12}
        emptyHint={view === "mine" ? "None of your asks here." : "No asks here."}
        renderCard={(o) => (
          <BoardCard
            opp={o}
            stages={stages}
            today={today}
            stageType={typeOf(o.stage)}
            onMove={move}
            members={members}
            meId={me?.userId ?? null}
            canAssign={canAssign}
          />
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <span className={TYPE.bodyMuted}>
          {onBoard} ask{onBoard === 1 ? "" : "s"} in this view
          {shown.length > onBoard
            ? ` (${shown.length - onBoard} more in stages this view hides)`
            : ""}
        </span>
      </div>
    </>
  );
}

function BoardCard({
  opp,
  stages,
  stageType,
  today,
  onMove,
  members,
  meId,
  canAssign,
}: {
  opp: OpportunityRow;
  stages: PipelineStage[];
  stageType: string;
  today: string;
  onMove: (id: string, toStage: string) => Promise<void>;
  members: OrgMember[];
  meId: string | null;
  canAssign: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const urgency = cardUrgency(opp, stageType, today);
  const lostKey = stageKeysOfType(stages, "lost")[0] ?? null;
  const reopenKey = firstOpenStageKey(stages);
  const title = opp.constituentName || opp.label;

  async function moveTo(stage: string) {
    if (!stage || stage === opp.stage || busy) return;
    setBusy(true);
    try {
      await onMove(opp.id, stage);
      router.refresh();
    } catch {
      /* saveAction already toasted the reason */
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      aria-label={`${title}, ${opp.askAmount != null ? usd(opp.askAmount) : "no amount"}`}
      className={`relative bg-surface border rounded-panel p-3 text-sm ${urgency.tone === "late" ? "border-status-critical/40" : "border-hairline"} ${
        busy ? "opacity-60" : ""
      }`}
    >
      {opp.constituentId ? (
        <Link
          href={`/admin/fundraising/donors-funders/${opp.constituentId}`}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-ink-1 hover:underline underline-offset-2 block truncate"
        >
          {title}
        </Link>
      ) : (
        <span className="font-semibold text-ink-1 block truncate">{title}</span>
      )}
      {opp.label && opp.label !== title ? (
        <span className={`${TYPE.metadata} block truncate`}>{opp.label}</span>
      ) : null}

      <div className="flex items-baseline justify-between gap-2 mt-1.5 tabular-nums">
        <span className="font-semibold text-ink-1">
          {opp.askAmount != null ? usd(opp.askAmount) : "No amount"}
        </span>
        <span className={TYPE.metadata}>
          {opp.expectedClose
            ? `Closes ${shortDay(opp.expectedClose, today)}`
            : "No close date"}
        </span>
      </div>

      <div className="mt-2 pt-2 border-t border-hairline">
        <div className="min-w-0">
          {opp.nextStep ? (
            <div className="text-ink-1 leading-snug">{opp.nextStep}</div>
          ) : null}
          {urgency.tone !== "none" ? (
            <div
              className={`text-xs ${
                urgency.tone === "late" || urgency.tone === "missing"
                  ? "text-status-critical-text font-semibold"
                  : "text-ink-2"
              }`}
            >
              {urgency.text}
            </div>
          ) : null}
        </div>
      </div>

      {/* The owner: the member (owner_id), else the old free-text owner. Its
          own row so the name and the Change menu never crowd the next step.
          Clicks stay off the drag handle. */}
      <div
        className="mt-2 flex items-center gap-1.5 min-w-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-ink-3 shrink-0" aria-hidden>Owner</span>
        <OwnerChip
          entity="opportunities"
          id={opp.id}
          ownerId={opp.ownerId}
          fallbackText={opp.owner}
          members={members}
          meId={meId}
          canEdit={canAssign}
          variant="compact"
        />
      </div>

      <div className="grid gap-1.5 mt-2.5">
        <select
          aria-label={`Move ${title} to another stage`}
          value={opp.stage}
          disabled={busy}
          onChange={(e) => void moveTo(e.target.value)}
          className="h-9 w-full rounded-control border border-outline bg-surface px-2 text-xs text-ink-1 focus:outline-none focus:border-orange focus:ring-[3px] focus:ring-orange/20"
        >
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.key === opp.stage ? `Stage: ${s.label}` : `Move to ${s.label}`}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => setEditing(true)}
            aria-label={`Edit the ask for ${title}`}
          >
            Edit
          </Button>
          {stageType === "lost" && reopenKey ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              disabled={busy}
              onClick={() => void moveTo(reopenKey)}
            >
              Reopen
            </Button>
          ) : null}
          {stageType === "open" && lostKey ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: "Mark this ask as lost?",
                  body: "You can reopen it from the Lost column later.",
                  confirmLabel: "Mark lost",
                });
                if (ok) void moveTo(lostKey);
              }}
            >
              Lost
            </Button>
          ) : null}
          {opp.hubspotId ? (
            <Link
              href={`/admin/fundraising/prospects/by-hubspot/${opp.hubspotId}`}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-ink-2 hover:text-ink-1 underline underline-offset-2 px-1"
            >
              Brief
            </Link>
          ) : null}
          <Link
            href={`/admin/fundraising/pipeline/${opp.id}`}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-ink-2 hover:text-ink-1 underline underline-offset-2 px-1"
          >
            Open
          </Link>
        </div>
      </div>

      {editing ? (
        <OpportunityEditModal
          opp={opp}
          stages={stages}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </article>
  );
}
