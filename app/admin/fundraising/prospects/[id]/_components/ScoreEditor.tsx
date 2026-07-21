"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TYPE } from "@/lib/admin/typeScale";

export type ProspectScore = {
  hubspot_contact_id: string;
  score_capacity: number | null;
  score_likelihood: number | null;
  score_alignment: number | null;
  score_relationship: number | null;
  score_strategic_leverage: number | null;
  score_stage_fit: number | null;
  score_energy_suck: number | null;
  score_total: number | null;
  notes: string | null;
  scored_by: string | null;
  scored_at: string | null;
};

type FieldKey =
  | "score_capacity"
  | "score_likelihood"
  | "score_alignment"
  | "score_relationship"
  | "score_strategic_leverage"
  | "score_stage_fit"
  | "score_energy_suck";

type ApiKey =
  | "capacity"
  | "likelihood"
  | "alignment"
  | "relationship"
  | "strategic_leverage"
  | "stage_fit"
  | "energy_suck";

const DIMENSIONS: Array<{
  key: FieldKey;
  apiKey: ApiKey;
  label: string;
  helper: string;
}> = [
  { key: "score_capacity", apiKey: "capacity", label: "Capacity", helper: "Can they give at this level?" },
  { key: "score_likelihood", apiKey: "likelihood", label: "Likelihood", helper: "Will they actually give?" },
  { key: "score_alignment", apiKey: "alignment", label: "Alignment", helper: "Does our mission match theirs?" },
  { key: "score_relationship", apiKey: "relationship", label: "Relationship", helper: "How warm is the connection?" },
  { key: "score_strategic_leverage", apiKey: "strategic_leverage", label: "Strategic Leverage", helper: "Does winning them unlock others?" },
  { key: "score_stage_fit", apiKey: "stage_fit", label: "Stage Fit", helper: "Right time in their giving cycle?" },
  { key: "score_energy_suck", apiKey: "energy_suck", label: "Energy Suck", helper: "How draining is the pursuit? (higher = more draining)" },
];

type FormState = Record<FieldKey, string>; // empty string == null

function initialForm(score: ProspectScore | null): FormState {
  const fromValue = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  return {
    score_capacity: fromValue(score?.score_capacity),
    score_likelihood: fromValue(score?.score_likelihood),
    score_alignment: fromValue(score?.score_alignment),
    score_relationship: fromValue(score?.score_relationship),
    score_strategic_leverage: fromValue(score?.score_strategic_leverage),
    score_stage_fit: fromValue(score?.score_stage_fit),
    score_energy_suck: fromValue(score?.score_energy_suck),
  };
}

function parseField(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function cap(s: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ScoreEditor({
  prospectId,
  initial,
}: {
  prospectId: string;
  initial: ProspectScore | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialForm(initial));
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<ProspectScore | null>(initial);

  const liveTotal = useMemo(() => {
    return DIMENSIONS.reduce((acc, d) => {
      const n = parseField(form[d.key]);
      return acc + (typeof n === "number" ? n : 0);
    }, 0);
  }, [form]);

  function setField(key: FieldKey, value: string) {
    // Strip non-numeric so the controlled input behaves on partial typing.
    const cleaned = value.replace(/[^0-9]/g, "").slice(0, 2);
    setForm((prev) => ({ ...prev, [key]: cleaned }));
  }

  function fieldError(v: string): string | null {
    if (v === "") return null;
    const n = parseField(v);
    if (n === null) return "must be a number";
    if (n < 0 || n > 10) return "0–10";
    return null;
  }

  async function handleSave() {
    setError(null);

    const payload: Record<string, number | string | null> = { notes: notes || null };
    for (const d of DIMENSIONS) {
      const raw = form[d.key];
      const err = fieldError(raw);
      if (err) {
        setError(`${d.label}: ${err}`);
        return;
      }
      payload[d.apiKey] = parseField(raw);
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/prospects/${encodeURIComponent(prospectId)}/score`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { score: ProspectScore };
      setLastSaved(data.score);
      // Refresh server data so the rest of the page (and the list view if
      // user nav'd here from there) picks up the new score.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
        <h2 className={TYPE.sectionHeader}>
          Prospect Score
        </h2>
        {lastSaved && lastSaved.scored_at && (
          <div className="text-[11px] text-ink-2">
            Last scored by{" "}
            <span className="text-ink-1">{cap(lastSaved.scored_by)}</span> ·{" "}
            <span className="text-ink-1">{fmtAbsolute(lastSaved.scored_at)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {DIMENSIONS.map((d) => {
          const v = form[d.key];
          const err = fieldError(v);
          return (
            <label key={d.key} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-1 font-medium leading-tight">
                  {d.label}
                </div>
                <div className="text-[11px] text-ink-2 leading-tight mt-0.5">
                  {d.helper}
                </div>
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={v}
                onChange={(e) => setField(d.key, e.target.value)}
                placeholder="—"
                className={`w-16 text-center font-mono bg-tile border rounded-lg px-2 py-1.5 text-ink-1 focus:outline-none focus:border-orange/50 ${
                  err ? "border-expense/30" : "border-outline"
                }`}
                aria-invalid={err ? true : undefined}
                aria-label={`${d.label} score, 0 to 10`}
              />
            </label>
          );
        })}
      </div>

      <div className="mt-4">
        <label className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Why this score — context, sources, what you'd do next."
          className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
        />
      </div>

      <div className="mt-5 pt-4 border-t border-hairline flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="text-ink-2 uppercase tracking-wider text-xs">
            Total
          </span>{" "}
          <span className="font-display font-bold text-orange text-2xl ml-1 align-middle">
            {liveTotal}
          </span>{" "}
          <span className="text-ink-2">/ 70</span>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-expense text-xs">{error}</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Save score"}
          </button>
        </div>
      </div>
    </section>
  );
}
