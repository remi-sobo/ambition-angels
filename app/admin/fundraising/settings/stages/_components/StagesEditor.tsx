"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import type { PipelineOption, StageType } from "@/lib/fundraising/stages";
import { StaticTable } from "@/app/admin/_components/ui/DataTable";
import Button from "@/app/admin/_components/ui/Button";
import Input, { Select } from "@/app/admin/_components/ui/Input";
import { TextField, SelectField } from "@/app/admin/_components/ui/Field";

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
  const confirm = useConfirm();
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
        setError(userMessage(res, j));
        return;
      }
      router.refresh();
    } catch {
      setError(networkMessage());
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
      <div className="inline-flex items-center gap-1 bg-tile border-hairline rounded-full p-1">
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

      {/* The kit table (V4 P1): every inline control carries its label;
          cards under 640px. */}
      <div className={busy ? "opacity-60" : ""}>
        <StaticTable
          label="Stages"
          noun={{ one: "stage", many: "stages" }}
          rows={rows}
          getRowId={(s) => s.id}
          getRowLabel={(s) => s.label}
          minWidth={820}
          columns={[
            {
              key: "label",
              header: "Label",
              card: "title",
              render: (s) => (
                <div className={s.isActive ? "" : "opacity-50"}>
                  <LabelCell key={`${s.id}:${s.label}`} stage={s} onPatch={(f) => void patch(s.id, f)} />
                </div>
              ),
            },
            {
              key: "order",
              header: "Order",
              render: (s) => {
                const i = rows.indexOf(s);
                return (
                  <div className="flex items-center gap-1">
                    <Button variant="quiet" size="sm" iconOnly onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.label} up`}>
                      ▲
                    </Button>
                    <Button variant="quiet" size="sm" iconOnly onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move ${s.label} down`}>
                      ▼
                    </Button>
                  </div>
                );
              },
            },
            {
              key: "type",
              header: "Type",
              render: (s) => (
                <Select aria-label={`Type for ${s.label}`} value={s.stageType} onChange={(e) => void patch(s.id, { stage_type: e.target.value })}>
                  {(Object.keys(TYPE_LABEL) as StageType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              ),
            },
            {
              key: "prob",
              header: "Prob %",
              render: (s) => <ProbCell key={`${s.id}:${s.probabilityDefault}`} stage={s} onPatch={(f) => void patch(s.id, f)} />,
            },
            {
              key: "external",
              header: "HubSpot stage id",
              render: (s) => <ExtIdCell key={`${s.id}:${s.externalStageId}`} stage={s} onPatch={(f) => void patch(s.id, f)} />,
            },
            { key: "asks", header: "Asks", align: "right", render: (s) => <span className="text-ink-2 tabular-nums">{usage[`${pipeline}:${s.key}`] ?? 0}</span> },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (s) => {
                const count = usage[`${pipeline}:${s.key}`] ?? 0;
                const inUse = count > 0;
                return (
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void patch(s.id, { is_active: !s.isActive })}
                      disabled={inUse && s.isActive}
                      title={
                        inUse && s.isActive
                          ? `Move the ${count} ask${count === 1 ? "" : "s"} in this stage first`
                          : s.isActive
                            ? "Hide this column"
                            : "Show this column"
                      }
                    >
                      {s.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={inUse}
                      title={inUse ? `Move the ${count} ask${count === 1 ? "" : "s"} in this stage first` : "Delete stage"}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Delete the "${s.label}" stage?`,
                          confirmLabel: "Delete",
                          destructive: true,
                        });
                        if (ok) void call(`/api/admin/pipeline-stages/${s.id}`, "DELETE");
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                );
              },
            },
          ]}
        />
      </div>

      <AddStageForm
        pipeline={pipeline}
        onAdd={(fields) => void call("/api/admin/pipeline-stages", "POST", fields)}
        busy={busy}
      />

      <p className="text-xs text-ink-3 leading-relaxed max-w-[640px]">
        Type drives the forecast: <strong>Open</strong> counts toward weighted pipeline,{" "}
        <strong>Won</strong> is committed, Lost and On hold count toward neither. The HubSpot stage
        id links a stage to its HubSpot counterpart for two-way sync. Leave it blank for
        Bloom-only stages. Stages holding asks can&apos;t be deactivated or deleted; move the cards
        first.
      </p>
    </div>
  );
}

// Inline cells keep their own draft and save on blur. Each is keyed by the
// saved value, so a refresh after a save resets the draft.
function LabelCell({ stage, onPatch }: { stage: EditorStage; onPatch: (fields: Record<string, unknown>) => void }) {
  const [label, setLabel] = useState(stage.label);
  return (
    <div>
      <Input
        aria-label={`Label for ${stage.label}`}
        className="w-full min-w-[140px]"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label.trim() && label.trim() !== stage.label) onPatch({ label: label.trim() });
        }}
      />
      <span className="block text-xs text-ink-3 font-mono mt-0.5">{stage.key}</span>
    </div>
  );
}

function ProbCell({ stage, onPatch }: { stage: EditorStage; onPatch: (fields: Record<string, unknown>) => void }) {
  const [prob, setProb] = useState(stage.probabilityDefault?.toString() ?? "");
  return (
    <Input
      aria-label={`Default probability for ${stage.label}`}
      className="w-20"
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
  );
}

function ExtIdCell({ stage, onPatch }: { stage: EditorStage; onPatch: (fields: Record<string, unknown>) => void }) {
  const [extId, setExtId] = useState(stage.externalStageId ?? "");
  return (
    <Input
      aria-label={`HubSpot stage id for ${stage.label}`}
      className="w-full min-w-[120px] font-mono text-xs"
      value={extId}
      placeholder="—"
      onChange={(e) => setExtId(e.target.value)}
      onBlur={() => {
        const v = extId.trim() === "" ? null : extId.trim();
        if (v !== stage.externalStageId) onPatch({ external_stage_id: v });
      }}
    />
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
      className="flex flex-wrap items-end gap-3 bg-surface border-hairline rounded-panel p-4"
    >
      <TextField
        label="New stage"
        controlSize="md"
        className="w-56"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Site Visit Scheduled"
      />
      <SelectField
        label="Type"
        controlSize="md"
        value={stageType}
        onChange={(e) => setStageType(e.target.value as StageType)}
        options={(Object.keys(TYPE_LABEL) as StageType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
      />
      <TextField label="Prob %" controlSize="md" className="w-24" type="number" min="0" max="100" value={prob} onChange={(e) => setProb(e.target.value)} />
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
