"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Candidate = {
  id: string;
  threadId: string;
  subject: string | null;
  constituentId: string;
  personName: string;
};

function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

/**
 * "Candidates from email" — intro threads the connected mailbox sent with a
 * teammate cc'd, surfaced off the existing Gmail sync (outbound + operator
 * participant + reconciled to a constituent). Suggest-then-confirm: nothing
 * here is a task yet. Add promotes it to a scheduling task tied to the
 * person, with a link back to the thread; Dismiss suppresses it so it won't
 * return next sync. The operator controls the queue entirely.
 */
export default function CandidatesQueue({
  candidates,
}: {
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  async function dispose(id: string, action: "add" | "dismiss") {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/admin/meet/connection-candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update candidate");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border-[1.5px] border-outline bg-tile overflow-hidden">
      <header className="px-5 py-3 border-b border-outline flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-1">Candidates from email</h2>
        <span className="text-[11px] text-ink-3">{candidates.length}</span>
        <span className="ml-auto text-[11px] text-ink-3">
          Intros with you on them — add the real ones, dismiss the rest.
        </span>
      </header>
      <ul className="divide-y divide-hairline">
        {candidates.map((c) => (
          <li key={c.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink-1 font-medium truncate">
                {c.personName}
              </div>
              <div className="text-xs text-ink-2 truncate">
                {c.subject?.trim() || "(no subject)"}
              </div>
            </div>
            <a
              href={gmailThreadUrl(c.threadId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors"
            >
              Open thread →
            </a>
            <button
              type="button"
              disabled={busy === c.id}
              onClick={() => dispose(c.id, "add")}
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full disabled:opacity-50"
            >
              {busy === c.id ? "…" : "Add to backlog"}
            </button>
            <button
              type="button"
              disabled={busy === c.id}
              onClick={() => dispose(c.id, "dismiss")}
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-1.5 disabled:opacity-50"
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="px-5 py-2 text-expense text-xs">{error}</p>}
    </section>
  );
}
