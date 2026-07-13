"use client";

// Client pieces of the career library pipeline: curate an imported
// occupation into the queue, generate a draft, review it (read the ladder,
// edit inline, approve). Approval is the one action that cannot be batched.

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

function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const call = async (key: string, url: string, method: string, body?: unknown) => {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) alert(j.error ?? `HTTP ${res.status}`);
      router.refresh();
      return res.ok;
    } finally {
      setBusy(null);
    }
  };
  return { busy, call };
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

// ── Review panel ──────────────────────────────────────────────────────────

function ReviewPanel({ occ, card }: { occ: OccupationView; card: CardView }) {
  const { busy, call } = useApi();
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
              {busy === "generate" ? "Generating…" : card.day_vignette ? "Regenerate" : "Generate draft"}
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
  const { busy, call } = useApi();
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const cardBySoc = useMemo(() => new Map(cards.map((c) => [c.soc_code, c])), [cards]);
  const occBySoc = useMemo(() => new Map(occupations.map((o) => [o.soc_code, o])), [occupations]);

  const catalog = cards
    .map((c) => ({ card: c, occ: occBySoc.get(c.soc_code) }))
    .filter((x): x is { card: CardView; occ: OccupationView } => Boolean(x.occ));
  const drafts = catalog.filter((x) => x.card.status === "draft");
  const approved = catalog.filter((x) => x.card.status === "approved");
  const retired = catalog.filter((x) => x.card.status === "retired");

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
            onClick={() => call(`gen-${card.soc_code}`, "/api/admin/careers/generate", "POST", { soc_code: card.soc_code })}
            disabled={busy !== null}
            className="text-[12px] font-semibold bg-ink-1 text-surface px-4 py-1.5 rounded-full disabled:opacity-50"
          >
            {busy === `gen-${card.soc_code}` ? "Generating…" : "Generate draft"}
          </button>
        </div>
      )}
      {open === card.soc_code && <ReviewPanel occ={occ} card={card} />}
    </div>
  );

  return (
    <div className="space-y-8">
      {drafts.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-2">
            In the pipeline ({drafts.length})
          </p>
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
                disabled={busy !== null}
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
