"use client";

// Client half of the play-pool review (specs/teen-games-v1.md Phase 1).
// One list, three views: candidates you can flip eligible (reveal line
// prefilled from the O*NET description, edited by hand), rows already in
// the pool, and rows the rules block. Approval is one click per
// occupation and stays that way — the pool being human-curated is the
// mitigation for "the pool is boring and the game is unfair".

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { draftRevealLine, eligibilityIssues, REVEAL_LINE_MAX } from "@/lib/games/pool";

export type PoolOccupation = {
  soc_code: string;
  title: string;
  description: string | null;
  pay_median: number | null;
  job_zone: number;
};

export type PoolRow = {
  soc_code: string;
  eligible: boolean;
  higher_wage: boolean;
  daily: boolean;
  the_cut: boolean;
  reveal_line: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

const GAME_FLAGS = [
  { key: "higher_wage", label: "Higher Wage" },
  { key: "daily", label: "Daily" },
  { key: "the_cut", label: "The Cut" },
] as const;

type View = "candidates" | "eligible" | "blocked";

const fmtPay = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US")}`);

function useApi() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const call = async (key: string, body: unknown): Promise<boolean> => {
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/careers/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(j.error ?? `That didn't work (HTTP ${res.status}). Try again.`);
      router.refresh();
      return res.ok;
    } catch {
      setNotice("Network hiccup — give it a few seconds, then refresh.");
      router.refresh();
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, notice, call };
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

function RowEditor({ occ, row }: { occ: PoolOccupation; row: PoolRow | undefined }) {
  const { busy, notice, call } = useApi();
  const [reveal, setReveal] = useState(row?.reveal_line ?? draftRevealLine(occ.description));
  const [flags, setFlags] = useState({
    higher_wage: row?.higher_wage ?? true,
    daily: row?.daily ?? true,
    the_cut: row?.the_cut ?? true,
  });
  const issues = eligibilityIssues(occ);
  const eligible = row?.eligible ?? false;
  const revealDirty = reveal.trim() !== (row?.reveal_line ?? "").trim();

  return (
    <div className="mt-3 border-t border-outline pt-3 space-y-3 text-[13px]">
      {occ.description && <p className="text-ink-2 text-[12px] leading-relaxed">{occ.description}</p>}

      {issues.length > 0 ? (
        <div className="bg-orange-light rounded-lg px-3 py-2 text-[12px] text-orange-dark">
          Blocked by the rules: {issues.join(", ")}. Fix the import, or leave it out — the pool is
          allowed to be smaller than the catalog.
        </div>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 mb-1">
              Reveal line · what the projector says when this job is revealed
            </p>
            <input
              type="text"
              maxLength={REVEAL_LINE_MAX}
              value={reveal}
              onChange={(e) => setReveal(e.target.value)}
              className="w-full border border-outline rounded-lg px-3 py-2 text-[13px] bg-surface"
            />
            <p className="text-[11px] text-ink-2 mt-0.5">
              {reveal.trim().length}/{REVEAL_LINE_MAX}
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            {GAME_FLAGS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 text-[12px] text-ink-1">
                <input
                  type="checkbox"
                  checked={flags[key]}
                  onChange={(e) => setFlags((p) => ({ ...p, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => call("approve", { soc_code: occ.soc_code, action: "approve", reveal_line: reveal, ...flags })}
              disabled={busy !== null || !reveal.trim()}
              title="You read the line. It plays."
              className="text-[12px] font-semibold bg-revenue text-white px-4 py-1.5 rounded-full disabled:opacity-50"
            >
              {busy === "approve"
                ? "Approving…"
                : eligible
                  ? revealDirty
                    ? "Re-approve with this line"
                    : "Re-approve"
                  : "Approve — in the pool"}
            </button>
            {eligible && (
              <>
                <span className="text-[12px] text-ink-2">
                  Approved by {row?.approved_by}
                  {row?.approved_at ? ` · ${new Date(row.approved_at).toLocaleDateString()}` : ""}
                </span>
                <button
                  onClick={() => call("revoke", { soc_code: occ.soc_code, action: "revoke" })}
                  disabled={busy !== null}
                  className="text-[12px] font-semibold bg-tile text-ink-1 px-4 py-1.5 rounded-full disabled:opacity-50"
                >
                  {busy === "revoke" ? "Pulling…" : "Pull from pool"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {notice && (
        <p className="text-[12px] text-orange-dark bg-orange-light rounded-lg px-3 py-2">{notice}</p>
      )}
    </div>
  );
}

export function PoolControls({
  occupations,
  pool,
}: {
  occupations: PoolOccupation[];
  pool: Record<string, PoolRow>;
}) {
  const [view, setView] = useState<View>("candidates");
  const [query, setQuery] = useState("");
  const [openSoc, setOpenSoc] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return occupations.filter((occ) => {
      const row = pool[occ.soc_code];
      const blocked = eligibilityIssues(occ).length > 0;
      const matchesView =
        view === "eligible" ? (row?.eligible ?? false)
        : view === "blocked" ? blocked
        : !blocked && !(row?.eligible ?? false);
      if (!matchesView) return false;
      if (!q) return true;
      return occ.title.toLowerCase().includes(q) || occ.soc_code.includes(q);
    });
  }, [occupations, pool, view, query]);

  const tabs: { key: View; label: string }[] = [
    { key: "candidates", label: "Candidates" },
    { key: "eligible", label: "In the pool" },
    { key: "blocked", label: "Blocked" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setView(t.key);
              setOpenSoc(null);
            }}
            className={`text-[12px] font-semibold px-4 py-1.5 rounded-full ${
              view === t.key ? "bg-ink-1 text-surface" : "bg-tile text-ink-2 hover:text-ink-1"
            }`}
          >
            {t.label}
          </button>
        ))}
        <input
          type="search"
          placeholder="Search title or SOC…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto border border-outline rounded-full px-4 py-1.5 text-[13px] bg-surface w-full sm:w-64"
        />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-[13px] text-ink-2 py-6 text-center">Nothing here{query ? " for that search" : ""}.</p>
        )}
        {rows.map((occ) => {
          const row = pool[occ.soc_code];
          const open = openSoc === occ.soc_code;
          const issues = eligibilityIssues(occ);
          return (
            <div
              key={occ.soc_code}
              className="bg-surface shadow-panel border-[1.5px] border-outline rounded-xl px-4 py-3"
            >
              <button
                onClick={() => setOpenSoc(open ? null : occ.soc_code)}
                className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-left"
              >
                <span className="font-semibold text-[13px] text-ink-1">{occ.title}</span>
                <span className="text-[11px] text-ink-2">{occ.soc_code}</span>
                <span className="text-[12px] text-ink-2">{fmtPay(occ.pay_median)}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <Chip>JZ {occ.job_zone}</Chip>
                  {row?.eligible && <Chip tone="good">In pool</Chip>}
                  {issues.map((issue) => (
                    <Chip key={issue} tone="warn">
                      {issue}
                    </Chip>
                  ))}
                </span>
              </button>
              {open && <RowEditor occ={occ} row={row} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
