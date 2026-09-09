"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

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

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline">
        <h2 className={TYPE.cardTitle}>Compose a report</h2>
        <p className="text-[11px] text-ink-3">
          Pick the numbers; the draft flags anything unresolved inline. Only the export is gated.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={titlePlaceholder}
          maxLength={120}
          className="w-full text-sm bg-surface border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange"
        />
        {metrics.length === 0 ? (
          <p className={TYPE.bodyMuted}>No metrics in the catalog yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {metrics.map((m) => {
              const flagged = m.state === "conflict" || m.state === "stale" || m.stale;
              return (
                <label
                  key={m.key}
                  className="flex items-center gap-2 text-sm text-ink-1 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.key)}
                    onChange={() => toggle(m.key)}
                    className="accent-orange"
                  />
                  <span className="truncate">{m.name}</span>
                  {flagged && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F4E8D0] text-[#A56A1B] uppercase tracking-wider">
                      {m.state === "conflict" ? "conflict" : "stale"}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={openDraft}
          disabled={selected.size === 0}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark rounded-full px-4 py-2 transition-colors disabled:opacity-40"
        >
          Draft it → ({selected.size})
        </button>
      </div>
    </section>
  );
}
