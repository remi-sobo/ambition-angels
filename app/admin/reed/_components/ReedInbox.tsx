"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Draft = { id: string; kind: string; title: string | null; body: string; status: string; created_at: string };
type Suggestion = {
  id: string;
  domain: string;
  title: string;
  rationale: string | null;
  priority: string;
  status: string;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  grant_narrative: "Grant narrative",
  board_update: "Board update",
  acknowledgment: "Acknowledgment",
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-orange/15 text-orange-mid border-orange/30",
  medium: "bg-white/5 text-ink-2 border-white/10",
  low: "bg-white/5 text-ink-3 border-white/10",
};

export default function ReedInbox({ drafts, suggestions }: { drafts: Draft[]; suggestions: Suggestion[] }) {
  return (
    <div className="px-4 lg:px-8 py-6 max-w-3xl">
      <header className="mb-6">
        <h1 className="font-heading font-bold text-cream text-2xl">Reed</h1>
        <p className="text-sm text-ink-3 mt-1">
          Review what Reed drafted and proposed. Approving a draft marks it ready for you to send — Reed never
          sends or executes anything itself.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-orange mb-3">
          Drafts to review
        </h2>
        {drafts.length === 0 ? (
          <Empty>No drafts waiting. Ask Reed to draft a grant narrative or acknowledgment.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-orange mb-3">
          Suggested next actions
        </h2>
        {suggestions.length === 0 ? (
          <Empty>No open suggestions. Ask Reed what to do next in a module.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {suggestions.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DraftCard({ draft }: { draft: Draft }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function decide(action: "approve" | "discard") {
    setBusy(true);
    try {
      const res = await fetch(`/api/reed/drafts/${draft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-heading font-semibold uppercase tracking-wider text-ink-3">
            {KIND_LABEL[draft.kind] ?? draft.kind}
          </span>
          <h3 className="font-heading font-semibold text-ink-1 text-sm mt-0.5">{draft.title ?? "Untitled draft"}</h3>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-ink-2 hover:text-orange shrink-0">
          {open ? "Hide" : "Read"}
        </button>
      </div>
      {open && <p className="mt-3 text-[13px] text-ink-2 leading-relaxed whitespace-pre-wrap">{draft.body}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => decide("approve")}
          disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => decide("discard")}
          disabled={busy}
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-3 py-1.5 rounded-full border border-white/10 disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(action: "accept" | "dismiss") {
    setBusy(true);
    try {
      const res = await fetch(`/api/reed/suggestions/${suggestion.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-heading font-semibold uppercase tracking-wider text-ink-3">
          {suggestion.domain}
        </span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
            PRIORITY_STYLE[suggestion.priority] ?? PRIORITY_STYLE.medium
          }`}
        >
          {suggestion.priority}
        </span>
      </div>
      <h3 className="font-heading font-semibold text-ink-1 text-sm">{suggestion.title}</h3>
      {suggestion.rationale && <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">{suggestion.rationale}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => decide("accept")}
          disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full disabled:opacity-50"
        >
          Accept
        </button>
        <button
          onClick={() => decide("dismiss")}
          disabled={busy}
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-3 py-1.5 rounded-full border border-white/10 disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-dashed border-white/10 px-4 py-6 text-[13px] text-ink-3">{children}</div>;
}
