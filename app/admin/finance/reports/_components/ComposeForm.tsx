"use client";

import { useState } from "react";
import EmptyState from "@/app/admin/_components/EmptyState";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";
import Button from "@/app/admin/_components/ui/Button";
import Badge from "@/app/admin/_components/ui/Badge";
import { Checkbox } from "@/app/admin/_components/ui/Input";
import { TextField } from "@/app/admin/_components/ui/Field";

// Spec Finance N3 — compose a report. Selection state lives in the URL: the
// button navigates to the draft with a fresh report id (rid), which is the
// artifact id waivers attach to and, at export, the documents row id. A
// conflicted/stale metric is SELECTABLE on purpose — drafting is never
// blocked (Contract 7 rule 1); the draft flags it and the exit gates it.

type MetricOpt = { key: string; name: string; state: string | null; stale: boolean };

export default function ComposeForm({
  metrics,
  // Shared with Impact → Reports since Spec Impact I2 (decision 2: one
  // compose flow, parameterized). The defaults ARE the N3 finance behavior.
  basePath = "/admin/finance/reports",
  defaultTitle = "Financial report",
  titlePlaceholder = "Report title (e.g. FY27 Q1 funder update)",
}: {
  metrics: MetricOpt[];
  basePath?: string;
  defaultTitle?: string;
  titlePlaceholder?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openDraft() {
    const params = new URLSearchParams({
      draft: "1",
      rid: crypto.randomUUID(),
      title: title.trim() || defaultTitle,
      keys: Array.from(selected).join(","),
    });
    router.push(`${basePath}?${params.toString()}`);
  }

  // V4 Stage G2: a labeled title field, kit checkboxes, one primary button.
  return (
    <section className="bg-surface border border-hairline rounded-panel overflow-hidden">
      <div className="px-5 py-4 border-b border-hairline">
        <h2 className={TYPE.cardTitle}>Compose a report</h2>
        <p className={`${TYPE.bodyMuted} mt-1`}>
          Pick the numbers. The draft flags anything unresolved where it appears; only the export is held back.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <TextField
          label="Report title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={titlePlaceholder}
          maxLength={120}
        />
        {metrics.length === 0 ? (
          <EmptyState
            label="metrics"
            title="No metrics in the catalog yet"
            hint="Reports pick their numbers from the Metric Catalog. Define the first metric and it appears here."
            action={
              <Button variant="secondary" size="sm" href="/admin/impact/kpis">
                Open the Metric Catalog
              </Button>
            }
          />
        ) : (
          <fieldset>
            <legend className={`${TYPE.fieldLabel} mb-2`}>Numbers to include</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {metrics.map((m) => {
                const flagged = m.state === "conflict" || m.state === "stale" || m.stale;
                return (
                  <label key={m.key} className="flex items-center gap-2 min-h-[36px] text-sm text-ink-1 cursor-pointer">
                    <Checkbox checked={selected.has(m.key)} onChange={() => toggle(m.key)} />
                    <span className="truncate">{m.name}</span>
                    {flagged ? <Badge tone="warning">{m.state === "conflict" ? "Conflict" : "Out of date"}</Badge> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end">
          <Button onClick={openDraft} disabled={selected.size === 0}>
            {`Draft the report (${selected.size})`}
          </Button>
        </div>
      </div>
    </section>
  );
}
