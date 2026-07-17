"use client";

import { useRef, useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Grant Coach panel: paste the proposal draft (plus, optionally, the funder's
 * RFP or "What We Fund" page), run the assessment, then run deep-dive prompts
 * against the same paste. Results are session-only — newest first, kept in
 * state so an assessment isn't clobbered by a deep dive. Nothing is persisted;
 * the draft itself stays wherever it lives (usually the ask's PDF or a doc).
 *
 * The prompt texts stay server-side (lib/fundraising/grantCoach.ts); the
 * server page passes only {id, label, blurb} so the library never ships in
 * the client bundle. Input ceilings mirror MAX_PROPOSAL_CHARS/MAX_FUNDER_CHARS
 * there — the route clamps anyway, so these are UX, not enforcement.
 */

export type CoachPromptMeta = { id: string; label: string; blurb: string };

type CoachRun = {
  key: number;
  label: string;
  text: string;
};

// Coach output is prose lines with **bold** labels — render just that, via JSX
// (no dangerouslySetInnerHTML), matching the ProjectDescription idiom.
function renderBold(text: string, baseKey: string): ReactNode[] {
  const re = /\*\*[^*\n]+\*\*/g;
  const out: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    out.push(
      <strong key={`${baseKey}-${i++}`} className="text-ink-1">
        {m[0].slice(2, -2)}
      </strong>
    );
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}

function CoachResult({ run }: { run: CoachRun }) {
  return (
    <div className="border-[1.5px] border-outline rounded-card p-4 bg-ink/40">
      <p className={`${TYPE.cardLabel} mb-2`}>{run.label}</p>
      <div className="space-y-1.5">
        {run.text.split("\n").map((line, i) =>
          line.trim() === "" ? null : (
            <p key={i} className="text-sm text-ink-2 leading-relaxed">
              {renderBold(line, `l-${i}`)}
            </p>
          )
        )}
      </div>
    </div>
  );
}

export default function GrantCoach({
  grantId,
  prompts,
  attribution,
  attributionUrl,
}: {
  grantId: string;
  prompts: CoachPromptMeta[];
  attribution: string;
  attributionUrl: string;
}) {
  const [proposal, setProposal] = useState("");
  const [funderMaterials, setFunderMaterials] = useState("");
  const [showFunder, setShowFunder] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<CoachRun[]>([]);
  const nextKey = useRef(0);

  const assessment = prompts.find((p) => p.id === "assessment") ?? prompts[0];
  const deepDives = prompts.filter((p) => p.id !== assessment.id);

  async function run(promptId: string) {
    setRunningId(promptId);
    setError(null);
    try {
      const r = await fetch("/api/admin/grants/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId,
          grantId,
          proposal,
          funderMaterials: funderMaterials.trim() || null,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
      setRuns((prev) => [
        { key: nextKey.current++, label: body.label ?? promptId, text: body.text ?? "" },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The coach run failed — try again.");
    } finally {
      setRunningId(null);
    }
  }

  const ready = proposal.trim().length >= 200 && !runningId;

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline">
        <h2 className={TYPE.cardTitle}>Grant Coach</h2>
        <p className="text-xs text-ink-2 mt-0.5">
          Stress-test the proposal draft with the lens a funder uses — it names gaps and the
          evidence to close them; it won&apos;t write the proposal for you.
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label htmlFor={`coach-proposal-${grantId}`} className={`${TYPE.cardLabel} block mb-1.5`}>
            Proposal draft
          </label>
          <textarea
            id={`coach-proposal-${grantId}`}
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            maxLength={80_000}
            rows={8}
            placeholder="Paste the full proposal or LOI draft here…"
            className="w-full bg-ink/40 border border-outline rounded-card p-3 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange/60 resize-y"
          />
          <p className={`${TYPE.metadata} mt-1`}>
            Don&apos;t paste sensitive donor data, client identities, or unreleased financials —
            anonymize first.
          </p>
        </div>

        {showFunder ? (
          <div>
            <label htmlFor={`coach-funder-${grantId}`} className={`${TYPE.cardLabel} block mb-1.5`}>
              Funder materials (optional)
            </label>
            <textarea
              id={`coach-funder-${grantId}`}
              value={funderMaterials}
              onChange={(e) => setFunderMaterials(e.target.value)}
              maxLength={40_000}
              rows={5}
              placeholder="Paste the RFP, application questions, or their “What We Fund” page — the coach then rates against their criteria and checks eligibility…"
              className="w-full bg-ink/40 border border-outline rounded-card p-3 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange/60 resize-y"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowFunder(true)}
            className="text-xs text-orange hover:underline"
          >
            + Add funder materials (RFP / “What We Fund”) to rate against their criteria
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => run(assessment.id)}
            disabled={!ready}
            title={assessment.blurb}
            className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {runningId === assessment.id ? "Assessing…" : assessment.label}
          </button>
          <span className={TYPE.metadata}>
            {proposal.trim().length < 200
              ? "Paste the draft to enable the coach."
              : "Start with the assessment, then run the deep dives it points to."}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {deepDives.map((p) => (
            <button
              key={p.id}
              onClick={() => run(p.id)}
              disabled={!ready}
              title={p.blurb}
              className="text-xs font-medium px-2.5 py-1.5 rounded-full border border-outline text-ink-2 hover:text-ink-1 hover:border-orange/50 disabled:opacity-40 transition-colors"
            >
              {runningId === p.id ? "Running…" : p.label}
            </button>
          ))}
        </div>

        {error && <p className="text-expense text-xs">{error}</p>}

        {runs.length > 0 && (
          <div className="space-y-3">
            {runs.map((r) => (
              <CoachResult key={r.key} run={r} />
            ))}
          </div>
        )}

        <p className={TYPE.metadata}>
          <a href={attributionUrl} target="_blank" rel="noreferrer" className="hover:underline">
            {attribution}
          </a>
        </p>
      </div>
    </section>
  );
}
