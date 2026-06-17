"use client";

// Fit-score rubric: rate the org on the seven dimensions (0–5 each); the
// overall 0–100 priority is derived live. Save persists score_factors +
// priority_score in one PATCH.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RUBRIC_FACTORS, RUBRIC_MAX, scoreFromFactors, scoreBand, SCORE_BAND_STYLE,
  type ScoreFactors,
} from "../../_lib/rubric";

export function RubricEditor({ partnerId, initial }: {
  partnerId: string;
  initial: ScoreFactors | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<ScoreFactors>(initial ?? {});

  const score = scoreFromFactors(factors);
  const band = scoreBand(score);

  const set = (key: string, val: number) =>
    setFactors((f) => {
      const next = { ...f };
      if (next[key as keyof ScoreFactors] === val) delete next[key as keyof ScoreFactors];
      else next[key as keyof ScoreFactors] = val;
      return next;
    });

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/partners/manage/${partnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score_factors: factors }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Fit score</h3>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${SCORE_BAND_STYLE[band]}`}>
            {score == null ? "Not scored" : `${score}/100`}
          </span>
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors">
            {open ? "Close" : initial ? "Edit" : "Score"}
          </button>
        </div>
      </div>

      {!open ? (
        initial ? (
          <div className="space-y-1">
            {RUBRIC_FACTORS.filter((f) => typeof factors[f.key] === "number").map((f) => (
              <div key={f.key} className="flex items-center gap-2 text-[11px]">
                <span className="text-ink-2 w-32 flex-shrink-0">{f.label}</span>
                <div className="flex-1 h-1.5 bg-tile rounded-full overflow-hidden">
                  <div className="h-full bg-orange/70" style={{ width: `${((factors[f.key] ?? 0) / RUBRIC_MAX) * 100}%` }} />
                </div>
                <span className="text-ink-3 tabular-nums w-6 text-right">{factors[f.key]}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-ink-3">Not yet scored — rate geography, volume, readiness, funding & fit.</p>
        )
      ) : (
        <div className="space-y-2">
          {RUBRIC_FACTORS.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <span className="text-[11px] text-ink-2 w-32 flex-shrink-0" title={f.help}>{f.label}</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: RUBRIC_MAX + 1 }, (_, n) => (
                  <button
                    key={n}
                    onClick={() => set(f.key, n)}
                    className={`w-6 h-6 rounded-md text-[11px] font-semibold transition-colors ${
                      factors[f.key] === n
                        ? "bg-orange text-white"
                        : "bg-tile text-ink-3 hover:text-ink-1 border border-outline"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-1.5 rounded-full disabled:opacity-50">
              {busy ? "Saving…" : "Save score"}
            </button>
            <button onClick={() => { setFactors({}); }} className="text-[11px] text-ink-3 hover:text-expense px-2">Clear</button>
            <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${SCORE_BAND_STYLE[band]}`}>
              {score == null ? "—" : `${score}/100`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
