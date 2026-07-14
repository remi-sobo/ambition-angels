"use client";

// Client pieces of the career library pipeline: curate an imported
// occupation into the queue, generate a draft (one deep-model call,
// ~30 seconds — the UI says so and opens the card when it lands), review
// it (read the ladder, edit inline, approve). "Generate all queued" works
// through the queue one card at a time. Approval is the one action that
// cannot be batched, and never will be.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type OccupationView = {
  soc_code: string;
  title: string;
  riasec: Record<string, number>;
  job_zone: number;
  pay_median: number | null;
  pay_as_of: string;
};

export type CardView = {
  soc_code: string;
  field: string | null;
  day_vignette: string | null;
  clue_1: string | null;
  clue_2: string | null;
  clue_3: string | null;
  clue_4: string | null;
  clue_5: string | null;
  clue_6: string | null;
  clue_7: string | null;
  clue_8: string | null;
  status: string;
  generated_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reading_grade: number | null;
  last_gate_result: { passed: boolean; failures: { gate: string; detail: string }[] } | null;
};

const CLUE_LABELS = [
  "The problem I solve",
  "What I actually do all day",
  "Three skills that matter",
  "Who is counting on me",
  "Where I work",
  "How you get here (rendered from data)",
  "What it pays (rendered from data)",
  "The thing nobody knows",
];

const GENERATING_LABEL = "Writing the card… ~30s";

// Curation math (from the scorer simulation): every RIASEC letter needs
// this many approved cards before a kid whose profile lives there gets a
// full, real top ten instead of thin-corner filler.
const COVERAGE_TARGET = 7;
const LETTER_LABELS: Record<string, string> = {
  R: "Build",
  I: "Analyze",
  A: "Create",
  S: "Help",
  E: "Lead",
  C: "Organize",
};

function dominantLetter(riasec: Record<string, number>): string {
  return Object.entries(riasec).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?";
}

function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const call = async (key: string, url: string, method: string, body?: unknown): Promise<boolean> => {
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(j.error ?? `That didn't work (HTTP ${res.status}). Try again.`);
      }
      router.refresh();
      return res.ok;
    } catch {
      setNotice("Network hiccup — the request may still be finishing. Give it a few seconds, then refresh.");
      router.refresh();
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, notice, setNotice, call };
}

const fmtPay = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US")}`);

function dominantLetters(riasec: Record<string, number>): string {
  return Object.entries(riasec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k)
    .join("");
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" }) {
  const tones = {
    neutral: "bg-tile text-ink-2",
    good: "bg-revenue-bg text-revenue",
    warn: "bg-orange-light text-orange-dark",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="text-[12px] text-orange-dark bg-orange-light rounded-lg px-3 py-2 mt-2">{text}</p>
  );
}

// ── Review panel ──────────────────────────────────────────────────────────

function ReviewPanel({ occ, card }: { occ: OccupationView; card: CardView }) {
  const { busy, notice, call } = useApi();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const isDraft = card.status === "draft";
  const clueKeys = ["clue_1", "clue_2", "clue_3", "clue_4", "clue_5", "clue_6", "clue_7", "clue_8"] as const;

  const value = (key: string) => edits[key] ?? ((card as unknown as Record<string, string | null>)[key] ?? "");
  const dirty = Object.keys(edits).some(
    (k) => edits[k] !== ((card as unknown as Record<string, string | null>)[k] ?? "")
  );

  const save = () =>
    call("save", "/api/admin/careers/card", "PATCH", { soc_code: card.soc_code, ...edits }).then(
      (ok) => ok && setEdits({})
    );

  const gate = card.last_gate_result;

  return (
    <div className="mt-3 border-t border-outline pt-3 space-y-3 text-[13px]">
      {gate && !gate.passed && (
        <div className="bg-orange-light rounded-lg px-3 py-2">
          <p className="font-semibold text-orange-dark text-[12px] mb-1">Machine gates failing:</p>
          <ul className="text-orange-dark text-[12px] list-disc pl-4">
            {gate.failures.map((f, i) => (
              <li key={i}>{f.detail}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-1">
          The Day {card.reading_grade != null && <span className="normal-case">· reading grade {card.reading_grade}</span>}
        </p>
        {isDraft ? (
          <textarea
            className="w-full border border-outline rounded-lg px-3 py-2 text-[13px] min-h-32 bg-surface"
            value={value("day_vignette")}
            onChange={(e) => setEdits((p) => ({ ...p, day_vignette: e.target.value }))}
          />
        ) : (
          <p className="whitespace-pre-wrap text-ink-1">{card.day_vignette}</p>
        )}
      </div>

      <div className="space-y-2">
        {clueKeys.map((key, i) => {
          const rendered = key === "clue_6" || key === "clue_7";
          return (
            <div key={key}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                {i + 1}. {CLUE_LABELS[i]}
              </p>
              {isDraft && !rendered ? (
                <textarea
                  className="w-full border border-outline rounded-lg px-3 py-1.5 text-[13px] min-h-10 bg-surface"
                  value={value(key)}
                  onChange={(e) => setEdits((p) => ({ ...p, [key]: e.target.value }))}
                />
              ) : (
                <p className={rendered ? "text-ink-2" : "text-ink-1"}>{value(key) || "—"}</p>
              )}
            </div>
          );
        })}
      </div>

      <Notice text={notice} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {isDraft && dirty && (
          <button
            onClick={save}
            disabled={busy !== null}
            className="text-[12px] font-semibold bg-ink-1 text-surface px-4 py-1.5 rounded-full disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save edits"}
          </button>
        )}
        {isDraft && (
          <>
            <button
              onClick={() =>
                call("approve", "/api/admin/careers/review", "POST", { soc_code: card.soc_code, action: "approve" })
              }
              disabled={busy !== null || dirty}
              title={dirty ? "Save your edits first" : "You read it. It ships."}
              className="text-[12px] font-semibold bg-revenue text-white px-4 py-1.5 rounded-full disabled:opacity-50"
            >
              {busy === "approve" ? "Approving…" : "Approve — I read this"}
            </button>
            <button
              onClick={() =>
                call("generate", "/api/admin/careers/generate", "POST", { soc_code: card.soc_code })
              }
              disabled={busy !== null}
              className="text-[12px] font-semibold bg-tile text-ink-1 px-4 py-1.5 rounded-full disabled:opacity-50"
            >
              {busy === "generate" ? GENERATING_LABEL : card.day_vignette ? "Regenerate" : "Generate draft"}
            </button>
            <button
              onClick={() =>
                confirm(`Remove ${occ.title} from the queue?`) &&
                call("delete", "/api/admin/careers/review", "POST", { soc_code: card.soc_code, action: "delete" })
              }
              disabled={busy !== null}
              className="text-[12px] text-ink-2 px-2 py-1.5 hover:text-ink-1"
            >
              Remove
            </button>
          </>
        )}
        {card.status === "approved" && (
          <>
            <span className="text-[12px] text-ink-2">
              Approved by {card.reviewed_by}
              {card.reviewed_at ? ` · ${new Date(card.reviewed_at).toLocaleDateString()}` : ""}
            </span>
            <button
              onClick={() =>
                call("unapprove", "/api/admin/careers/review", "POST", { soc_code: card.soc_code, action: "unapprove" })
              }
              disabled={busy !== null}
              className="text-[12px] font-semibold bg-tile text-ink-1 px-4 py-1.5 rounded-full disabled:opacity-50"
            >
              Unapprove to edit
            </button>
            <button
              onClick={() =>
                call("retire", "/api/admin/careers/review", "POST", { soc_code: card.soc_code, action: "retire" })
              }
              disabled={busy !== null}
              className="text-[12px] text-ink-2 px-2 py-1.5 hover:text-ink-1"
            >
              Retire
            </button>
          </>
        )}
        {card.status === "retired" && (
          <button
            onClick={() =>
              call("unapprove", "/api/admin/careers/review", "POST", { soc_code: card.soc_code, action: "unapprove" })
            }
            disabled={busy !== null}
            className="text-[12px] font-semibold bg-tile text-ink-1 px-4 py-1.5 rounded-full disabled:opacity-50"
          >
            Back to draft
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

export function CareersControls({
  occupations,
  cards,
}: {
  occupations: OccupationView[];
  cards: CardView[];
}) {
  const { busy, notice, setNotice, call } = useApi();
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  const cardBySoc = useMemo(() => new Map(cards.map((c) => [c.soc_code, c])), [cards]);
  const occBySoc = useMemo(() => new Map(occupations.map((o) => [o.soc_code, o])), [occupations]);

  const catalog = cards
    .map((c) => ({ card: c, occ: occBySoc.get(c.soc_code) }))
    .filter((x): x is { card: CardView; occ: OccupationView } => Boolean(x.occ));
  const drafts = catalog.filter((x) => x.card.status === "draft");
  const queued = drafts.filter((x) => !x.card.day_vignette);
  const approved = catalog.filter((x) => x.card.status === "approved");
  const retired = catalog.filter((x) => x.card.status === "retired");

  const anythingBusy = busy !== null || batchProgress !== null;

  const generateOne = async (soc: string): Promise<boolean> => {
    const ok = await call(`gen-${soc}`, "/api/admin/careers/generate", "POST", { soc_code: soc });
    if (ok) setOpen(soc);
    return ok;
  };

  const generateAllQueued = async () => {
    const list = queued.map((x) => ({ soc: x.card.soc_code, title: x.occ.title }));
    for (let i = 0; i < list.length; i++) {
      setBatchProgress(`Writing ${i + 1} of ${list.length}: ${list[i].title}…`);
      const ok = await call(`gen-${list[i].soc}`, "/api/admin/careers/generate", "POST", {
        soc_code: list[i].soc,
      });
      if (!ok) {
        setBatchProgress(null);
        setNotice(
          `Stopped at ${list[i].title} — ${list.length - i - 1} still queued. Fix or retry, then run it again; finished drafts are saved.`
        );
        return;
      }
    }
    setBatchProgress(null);
    setNotice(`Done — ${list.length} drafts written. Read each one, then approve.`);
  };

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return occupations
      .filter((o) => !cardBySoc.has(o.soc_code))
      .filter((o) => (zone == null ? true : o.job_zone === zone))
      .filter((o) => (q ? o.title.toLowerCase().includes(q) || o.soc_code.includes(q) : true))
      .slice(0, 50);
  }, [occupations, cardBySoc, search, zone]);

  const CatalogRow = ({ card, occ }: { card: CardView; occ: OccupationView }) => (
    <div className="bg-surface shadow-panel border-[1.5px] border-outline rounded-xl px-4 py-3">
      <button className="w-full text-left" onClick={() => setOpen(open === card.soc_code ? null : card.soc_code)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink-1 text-[13px]">{occ.title}</span>
          <span className="text-[11px] text-ink-2 tabular-nums">{card.soc_code}</span>
          {card.field && <Chip>{card.field}</Chip>}
          <Chip>JZ {occ.job_zone}</Chip>
          {card.status === "draft" && !card.day_vignette && <Chip tone="warn">queued</Chip>}
          {card.status === "draft" && card.day_vignette && (
            <Chip tone={card.last_gate_result?.passed ? "good" : "warn"}>
              {card.last_gate_result?.passed ? "gates pass · needs review" : "gates failing"}
            </Chip>
          )}
          {card.status === "approved" && <Chip tone="good">approved</Chip>}
          {card.status === "retired" && <Chip>retired</Chip>}
          <span className="ml-auto text-[12px] text-ink-2 tabular-nums">{fmtPay(occ.pay_median)}</span>
        </div>
      </button>
      {card.status === "draft" && !card.day_vignette && open !== card.soc_code && (
        <div className="mt-2">
          <button
            onClick={() => generateOne(card.soc_code)}
            disabled={anythingBusy}
            className="text-[12px] font-semibold bg-ink-1 text-surface px-4 py-1.5 rounded-full disabled:opacity-50"
          >
            {busy === `gen-${card.soc_code}` ? GENERATING_LABEL : "Generate draft"}
          </button>
        </div>
      )}
      {open === card.soc_code && <ReviewPanel occ={occ} card={card} />}
    </div>
  );

  // Coverage per dominant RIASEC letter: approved counts (what the scorer
  // sees) and pipeline counts (what is coming).
  const coverage = ["R", "I", "A", "S", "E", "C"].map((letter) => {
    const ofLetter = (rows: { occ: OccupationView }[]) =>
      rows.filter((x) => dominantLetter(x.occ.riasec) === letter);
    return {
      letter,
      approved: ofLetter(approved).length,
      // Reachable without a four-year degree: the Job Zone guarantee needs
      // ~3 of these per letter or thin-corner kids get poor-fit promotions.
      accessible: ofLetter(approved).filter((x) => x.occ.job_zone <= 3).length,
      pipeline: ofLetter(drafts).length,
    };
  });

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-2">
          Catalog coverage — a kid strongest in each trait needs {COVERAGE_TARGET}+ approved cards
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {coverage.map(({ letter, approved: a, accessible, pipeline: p }) => (
            <div
              key={letter}
              className={`rounded-xl border-[1.5px] px-3 py-2 ${
                a >= COVERAGE_TARGET && accessible >= 3
                  ? "border-outline bg-surface"
                  : "border-orange/60 bg-orange-light"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-2">
                {LETTER_LABELS[letter]} ({letter})
              </p>
              <p className="text-[15px] font-bold text-ink-1 tabular-nums">
                {a}
                <span className="text-[11px] font-semibold text-ink-2"> / {COVERAGE_TARGET}</span>
              </p>
              <p className="text-[10px] text-ink-2 tabular-nums">
                {accessible}/3 no-degree{p > 0 ? ` · +${p} queued` : ""}
              </p>
            </div>
          ))}
        </div>
      </section>

      {(notice || batchProgress) && (
        <div className="bg-surface shadow-panel border-[1.5px] border-outline rounded-xl px-4 py-3">
          {batchProgress && (
            <p className="text-[13px] font-semibold text-ink-1">
              <span className="inline-block w-3.5 h-3.5 border-2 border-outline border-t-ink-1 rounded-full animate-spin align-[-2px] mr-2" />
              {batchProgress}
            </p>
          )}
          <Notice text={notice} />
        </div>
      )}

      {drafts.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
              In the pipeline ({drafts.length})
            </p>
            {queued.length > 1 && (
              <button
                onClick={generateAllQueued}
                disabled={anythingBusy}
                className="text-[12px] font-semibold bg-ink-1 text-surface px-4 py-1.5 rounded-full disabled:opacity-50"
              >
                Generate all queued ({queued.length}) — about {Math.ceil(queued.length * 0.6)} min
              </button>
            )}
          </div>
          <div className="space-y-2">
            {drafts.map((x) => (
              <CatalogRow key={x.card.soc_code} {...x} />
            ))}
          </div>
        </section>
      )}

      {approved.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-2">
            Approved — live in the catalog ({approved.length})
          </p>
          <div className="space-y-2">
            {approved.map((x) => (
              <CatalogRow key={x.card.soc_code} {...x} />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-2">
          Imported occupations — pick the next card
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or SOC code…"
            className="border border-outline rounded-full px-4 py-1.5 text-[13px] bg-surface w-64"
          />
          {[null, 1, 2, 3, 4, 5].map((z) => (
            <button
              key={z ?? "all"}
              onClick={() => setZone(z)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-full ${
                zone === z ? "bg-ink-1 text-surface" : "bg-tile text-ink-2"
              }`}
            >
              {z == null ? "All zones" : `JZ ${z}`}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          {results.map((o) => (
            <div
              key={o.soc_code}
              className="bg-surface border-[1.5px] border-outline rounded-xl px-4 py-2 flex flex-wrap items-center gap-2"
            >
              <span className="font-semibold text-ink-1 text-[13px]">{o.title}</span>
              <span className="text-[11px] text-ink-2 tabular-nums">{o.soc_code}</span>
              <Chip>JZ {o.job_zone}</Chip>
              <Chip>{dominantLetters(o.riasec)}</Chip>
              <span className="text-[12px] text-ink-2 tabular-nums">{fmtPay(o.pay_median)}</span>
              <span className="ml-auto" />
              <button
                onClick={() => call(`q-${o.soc_code}`, "/api/admin/careers/queue", "POST", { soc_code: o.soc_code })}
                disabled={anythingBusy}
                className="text-[12px] font-semibold bg-tile text-ink-1 px-4 py-1.5 rounded-full hover:bg-[#EFE6D4] disabled:opacity-50"
              >
                {busy === `q-${o.soc_code}` ? "Adding…" : "Add to queue"}
              </button>
            </div>
          ))}
          {results.length === 0 && <p className="text-[13px] text-ink-2">No matches.</p>}
        </div>
      </section>

      {retired.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-2">
            Retired ({retired.length})
          </p>
          <div className="space-y-2">
            {retired.map((x) => (
              <CatalogRow key={x.card.soc_code} {...x} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
