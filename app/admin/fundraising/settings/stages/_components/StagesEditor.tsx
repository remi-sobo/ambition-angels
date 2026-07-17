"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineOption, StageType } from "@/lib/fundraising/stages";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The stage editor (Epic 1b). One pipeline at a time: rename labels inline,
 * retype (open/won/lost/on hold), set default probability and the HubSpot
 * dealstage id, reorder with ▲▼, deactivate or delete unused stages, add new
 * ones. Server guards mirror the UI ones (can't strand cards, can't remove the
 * last open stage) — the UI just explains them earlier.
 */

export type EditorStage = {
  id: string;
  pipeline: string;
  key: string;
  label: string;
  sortOrder: number;
  stageType: StageType;
  externalStageId: string | null;
  probabilityDefault: number | null;
  isActive: boolean;
};

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const TYPE_LABEL: Record<StageType, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  on_hold: "On hold",
};

export default function StagesEditor({
  pipelines,
  stages,
  usage,
}: {
  pipelines: PipelineOption[];
  stages: EditorStage[];
  usage: Record<string, number>;
}) {
  const router = useRouter();
  const [pipeline, setPipeline] = useState(
    pipelines.find((p) => p.isDefault)?.key ?? pipelines[0]?.key ?? "default"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = stages
    .filter((s) => s.pipeline === pipeline)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const call = async (path: string, method: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const patch = (id: string, fields: Record<string, unknown>) =>
    call(`/api/admin/pipeline-stages/${id}`, "PATCH", fields);

  const move = (index: number, dir: -1 | 1) => {
    const next = rows.map((r) => r.id);
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    void call("/api/admin/pipeline-stages/reorder", "POST", {
      pipeline,
      ordered_ids: next,
    });
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 bg-tile border-[1.5px] border-outline rounded-full p-1">
        {pipelines.map((p) => (
          <button
            key={p.key}
            onClick={() => setPipeline(p.key)}
            className={`font-semibold rounded-full px-3 py-1.5 text-xs transition-colors ${
              p.key === pipeline ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="text-expense text-sm">{error}</p>}

      <div className="bg-surface shadow-panel border-[1.5px] border-outline rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className={`text-left border-b border-outline ${TYPE.cardLabel}`}>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-2 py-2">Label</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Prob %</th>
              <th className="px-2 py-2">HubSpot stage id</th>
              <th className="px-2 py-2">Asks</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className={busy ? "opacity-60" : ""}>
            {rows.map((s, i) => (
              <StageRow
                key={s.id}
                stage={s}
                count={usage[`${pipeline}:${s.key}`] ?? 0}
                first={i === 0}
                last={i === rows.length - 1}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                onPatch={(fields) => void patch(s.id, fields)}
                onDelete={() => {
                  if (confirm(`Delete the "${s.label}" stage?`))
                    void call(`/api/admin/pipeline-stages/${s.id}`, "DELETE");
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <AddStageForm
        pipeline={pipeline}
        onAdd={(fields) => void call("/api/admin/pipeline-stages", "POST", fields)}
        busy={busy}
      />

      <p className="text-[12px] text-ink-3 leading-relaxed max-w-[640px]">
        Type drives the forecast: <strong>Open</strong> counts toward weighted pipeline,{" "}
        <strong>Won</strong> is committed, Lost and On hold count toward neither. The HubSpot stage
        id links a stage to its HubSpot counterpart for two-way sync — leave it blank for
        Bloom-only stages. Stages holding asks can&apos;t be deactivated or deleted; move the cards
        first.
      </p>
    </div>
  );
}

function StageRow({
  stage,
  count,
  first,
  last,
  onMoveUp,
  onMoveDown,
  onPatch,
  onDelete,
}: {
  stage: EditorStage;
  count: number;
  first: boolean;
  last: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatch: (fields: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(stage.label);
  const [prob, setProb] = useState(stage.probabilityDefault?.toString() ?? "");
  const [extId, setExtId] = useState(stage.externalStageId ?? "");

  const inUse = count > 0;

  return (
    <tr className={`border-b border-outline last:border-b-0 ${stage.isActive ? "" : "opacity-50"}`}>
      <td className="px-3 py-1.5">
        <div className="flex flex-col">
          <button
            onClick={onMoveUp}
            disabled={first}
            className="text-ink-3 hover:text-ink-1 disabled:opacity-30 text-[10px] leading-tight"
            aria-label={`Move ${stage.label} up`}
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={last}
            className="text-ink-3 hover:text-ink-1 disabled:opacity-30 text-[10px] leading-tight"
            aria-label={`Move ${stage.label} down`}
          >
            ▼
          </button>
        </div>
      </td>
      <td className="px-2 py-1.5">
        <input
          className={`${inputCls} w-full min-w-[140px]`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            if (label.trim() && label.trim() !== stage.label) onPatch({ label: label.trim() });
          }}
        />
        <span className="block text-[10px] text-ink-3 font-mono mt-0.5">{stage.key}</span>
      </td>
      <td className="px-2 py-1.5">
        <select
          className={`${inputCls}`}
          value={stage.stageType}
          onChange={(e) => onPatch({ stage_type: e.target.value })}
        >
          {(Object.keys(TYPE_LABEL) as StageType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          className={`${inputCls} w-16`}
          type="number"
          min="0"
          max="100"
          value={prob}
          onChange={(e) => setProb(e.target.value)}
          onBlur={() => {
            const v = prob === "" ? null : Number(prob);
            if (v !== stage.probabilityDefault) onPatch({ probability_default: v });
          }}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          className={`${inputCls} w-full min-w-[120px] font-mono text-xs`}
          value={extId}
          placeholder="—"
          onChange={(e) => setExtId(e.target.value)}
          onBlur={() => {
            const v = extId.trim() === "" ? null : extId.trim();
            if (v !== stage.externalStageId) onPatch({ external_stage_id: v });
          }}
        />
      </td>
      <td className="px-2 py-1.5 text-ink-2 tabular-nums">{count}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => onPatch({ is_active: !stage.isActive })}
            disabled={inUse && stage.isActive}
            title={
              inUse && stage.isActive
                ? `Move the ${count} ask${count === 1 ? "" : "s"} in this stage first`
                : stage.isActive
                ? "Hide this column"
                : "Show this column"
            }
            className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2 disabled:opacity-40"
          >
            {stage.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={onDelete}
            disabled={inUse}
            title={inUse ? `Move the ${count} ask${count === 1 ? "" : "s"} in this stage first` : "Delete stage"}
            className="px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-expense disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddStageForm({
  pipeline,
  onAdd,
  busy,
}: {
  pipeline: string;
  onAdd: (fields: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [label, setLabel] = useState("");
  const [stageType, setStageType] = useState<StageType>("open");
  const [prob, setProb] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        onAdd({
          pipeline,
          label: label.trim(),
          stage_type: stageType,
          probability_default: prob === "" ? null : Number(prob),
        });
        setLabel("");
        setProb("");
        setStageType("open");
      }}
      className="flex flex-wrap items-end gap-3 bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4"
    >
      <label className="text-xs text-ink-2">
        New stage
        <input
          className={`${inputCls} block w-56 mt-1`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Site Visit Scheduled"
        />
      </label>
      <label className="text-xs text-ink-2">
        Type
        <select
          className={`${inputCls} block mt-1`}
          value={stageType}
          onChange={(e) => setStageType(e.target.value as StageType)}
        >
          {(Object.keys(TYPE_LABEL) as StageType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        Prob %
        <input
          className={`${inputCls} block w-20 mt-1`}
          type="number"
          min="0"
          max="100"
          value={prob}
          onChange={(e) => setProb(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={busy || !label.trim()}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
      >
        Add stage
      </button>
    </form>
  );
}
