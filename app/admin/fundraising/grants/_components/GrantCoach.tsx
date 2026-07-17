"use client";

import { useRef, useState, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Reed's Proposal Review panel (spec: specs/reeds-proposal-review.md): pick
 * who will read the ask (the audience lens, defaulted from the funder's
 * record), point Reed at the draft — pasted text, or a PDF/text file already
 * attached to the grant or its asks — then run the assessment, the deep-dive
 * prompts, or the interactive "defend the draft" interrogation. One-shot
 * results stack newest-first; the defend session is a turn-by-turn chat.
 * Everything is session-only — nothing is persisted.
 *
 * The prompt texts stay server-side (lib/fundraising/grantCoach.ts); the
 * server page passes only {id, label, blurb} plus the lens list and the
 * attached-document list, so the library never ships in the client bundle.
 * Input ceilings mirror MAX_PROPOSAL_CHARS/MAX_FUNDER_CHARS there — the route
 * clamps anyway, so these are UX, not enforcement.
 */

export type CoachPromptMeta = { id: string; label: string; blurb: string };
export type CoachDocOption = { kind: "grant_doc" | "ask_doc"; id: string; label: string };
export type CoachLensOption = { id: string; label: string };

type CoachRun = { key: number; label: string; text: string };
type ChatTurn = { role: "user" | "assistant"; content: string };

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

function CoachText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) =>
        line.trim() === "" ? null : (
          <p key={i} className="text-sm text-ink-2 leading-relaxed">
            {renderBold(line, `l-${i}`)}
          </p>
        )
      )}
    </div>
  );
}

export default function GrantCoach({
  grantId,
  prompts,
  documents,
  lenses,
  defaultLens,
  defend,
  attribution,
  attributionUrl,
}: {
  grantId: string;
  prompts: CoachPromptMeta[];
  documents: CoachDocOption[];
  lenses: CoachLensOption[];
  defaultLens: string;
  defend: { label: string; blurb: string };
  attribution: string;
  attributionUrl: string;
}) {
  const [proposal, setProposal] = useState("");
  const [funderMaterials, setFunderMaterials] = useState("");
  const [showFunder, setShowFunder] = useState(false);
  // "paste" or "<kind>:<id>" of an attached document.
  const [source, setSource] = useState("paste");
  const [lens, setLens] = useState(defaultLens);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<CoachRun[]>([]);
  const nextKey = useRef(0);

  // Defend-the-draft chat state.
  const [defendOpen, setDefendOpen] = useState(false);
  const [defendHistory, setDefendHistory] = useState<ChatTurn[]>([]);
  const [defendInput, setDefendInput] = useState("");
  const [defendBusy, setDefendBusy] = useState(false);

  const assessment = prompts.find((p) => p.id === "assessment") ?? prompts[0];
  const deepDives = prompts.filter((p) => p.id !== assessment.id);

  const selectedDoc = (() => {
    if (source === "paste") return null;
    const [kind, id] = source.split(":");
    return documents.find((d) => d.kind === kind && d.id === id) ?? null;
  })();

  function draftBody(): Record<string, unknown> {
    return selectedDoc
      ? { document: { kind: selectedDoc.kind, id: selectedDoc.id } }
      : { proposal };
  }

  const draftReady = selectedDoc != null || proposal.trim().length >= 200;
  const ready = draftReady && !runningId && !defendBusy;

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
          lens,
          ...draftBody(),
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

  // One defend turn: send the visible history (plus the pending answer, when
  // there is one) and append the reviewer's reply.
  async function defendTurn(answer: string | null) {
    setDefendBusy(true);
    setError(null);
    const history: ChatTurn[] = answer
      ? [...defendHistory, { role: "user", content: answer }]
      : defendHistory;
    if (answer) {
      setDefendHistory(history);
      setDefendInput("");
    }
    try {
      const r = await fetch("/api/admin/grants/coach/defend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantId,
          lens,
          ...draftBody(),
          funderMaterials: funderMaterials.trim() || null,
          history,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
      setDefendHistory([...history, { role: "assistant", content: body.text ?? "" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The reviewer stalled — try again.");
    } finally {
      setDefendBusy(false);
    }
  }

  function openDefend() {
    setDefendOpen(true);
    if (defendHistory.length === 0) void defendTurn(null);
  }

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline">
        <h2 className={TYPE.cardTitle}>Reed&apos;s Proposal Review</h2>
        <p className="text-xs text-ink-2 mt-0.5">
          Reed reads your draft the way the actual audience will — naming the gaps and the
          evidence to close them; he won&apos;t write the proposal for you.
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label htmlFor={`coach-lens-${grantId}`} className={`${TYPE.cardLabel} block mb-1.5`}>
            Who will read this?
          </label>
          <select
            id={`coach-lens-${grantId}`}
            value={lens}
            onChange={(e) => setLens(e.target.value)}
            className="bg-ink/40 border border-outline rounded-lg px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-orange/60 max-w-full"
          >
            {lenses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <p className={`${TYPE.metadata} mt-1`}>
            Defaulted from the funder&apos;s record — change it if that&apos;s not who&apos;s
            reading.
          </p>
        </div>

        {documents.length > 0 && (
          <div>
            <label htmlFor={`coach-source-${grantId}`} className={`${TYPE.cardLabel} block mb-1.5`}>
              Draft source
            </label>
            <select
              id={`coach-source-${grantId}`}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="bg-ink/40 border border-outline rounded-lg px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-orange/60 max-w-full"
            >
              <option value="paste">Pasted text</option>
              {documents.map((d) => (
                <option key={`${d.kind}:${d.id}`} value={`${d.kind}:${d.id}`}>
                  Attached: {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedDoc == null && (
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
        )}

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
            {!draftReady
              ? "Paste the draft (or pick an attached document) to enable the coach."
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
          {!defendOpen && (
            <button
              onClick={openDefend}
              disabled={!ready}
              title={defend.blurb}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-full border border-orange/50 text-orange hover:bg-orange/10 disabled:opacity-40 transition-colors"
            >
              {defend.label}
            </button>
          )}
        </div>

        {error && <p className="text-expense text-xs">{error}</p>}

        {defendOpen && (
          <div className="border-[1.5px] border-orange/40 rounded-card p-4 bg-ink/40 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className={TYPE.cardLabel}>{defend.label} — live interrogation</p>
              <button
                onClick={() => {
                  setDefendOpen(false);
                  setDefendHistory([]);
                  setDefendInput("");
                }}
                className="text-[11px] text-ink-3 hover:text-ink-1"
              >
                End session
              </button>
            </div>
            <div className="space-y-3">
              {defendHistory.map((t, i) =>
                t.role === "assistant" ? (
                  <div key={i} className="border-l-2 border-orange/50 pl-3">
                    <CoachText text={t.content} />
                  </div>
                ) : (
                  <p key={i} className="text-sm text-ink-1 leading-relaxed pl-3 border-l-2 border-outline">
                    {t.content}
                  </p>
                )
              )}
              {defendBusy && <p className={TYPE.metadata}>The reader is thinking…</p>}
            </div>
            {defendHistory.length > 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const answer = defendInput.trim();
                  if (answer && !defendBusy) void defendTurn(answer);
                }}
                className="flex gap-2"
              >
                <input
                  value={defendInput}
                  onChange={(e) => setDefendInput(e.target.value)}
                  maxLength={4000}
                  placeholder="Answer the reader…"
                  className="flex-1 bg-ink/40 border border-outline rounded-lg px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange/60"
                />
                <button
                  type="submit"
                  disabled={defendBusy || !defendInput.trim()}
                  className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  Send
                </button>
              </form>
            )}
          </div>
        )}

        {runs.length > 0 && (
          <div className="space-y-3">
            {runs.map((r) => (
              <div key={r.key} className="border-[1.5px] border-outline rounded-card p-4 bg-ink/40">
                <p className={`${TYPE.cardLabel} mb-2`}>{r.label}</p>
                <CoachText text={r.text} />
              </div>
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
