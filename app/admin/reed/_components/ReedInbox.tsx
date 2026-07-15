"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useReedLauncher } from "@/app/admin/_components/reed/ReedLauncherProvider";
import { ReedMark } from "@/app/admin/_components/reed/ReedPanel";
import { TYPE } from "@/lib/admin/typeScale";

type Draft = { id: string; kind: string; title: string | null; body: string; status: string; created_at: string };
type HistoryMessage = { id: string; role: "user" | "assistant"; content: string };
type HistoryThread = { id: string; title: string | null; created_at: string; messages: HistoryMessage[] };
type Suggestion = {
  id: string;
  domain: string;
  title: string;
  rationale: string | null;
  priority: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};
type Proposal = {
  id: string;
  proposed_type: string;
  parent_ref: { type?: string; id?: string | null } | null;
  payload: Record<string, unknown> | null;
  rationale: string | null;
  status: string;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  grant_narrative: "Grant narrative",
  board_update: "Board update",
  acknowledgment: "Acknowledgment",
  strategy_review: "Strategy review",
};

const PROPOSED_TYPE_LABEL: Record<string, string> = {
  objective: "Objective",
  goal: "Goal",
  initiative: "Initiative",
  kpi: "KPI",
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-orange/15 text-orange-mid border-orange/30",
  medium: "bg-white/5 text-ink-2 border-white/10",
  low: "bg-white/5 text-ink-3 border-white/10",
};

export default function ReedInbox({
  drafts,
  approved,
  suggestions,
  proposals,
  history,
}: {
  drafts: Draft[];
  approved: Draft[];
  suggestions: Suggestion[];
  proposals: Proposal[];
  history: HistoryThread[];
}) {
  const reed = useReedLauncher();
  return (
    <div className="px-4 lg:px-8 py-6 max-w-3xl">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className={`${TYPE.pageTitle} !text-cream`}>Reed</h1>
          <p className="text-sm text-ink-3 mt-1">
            Review what Reed drafted and proposed. Approving a draft moves it to your ready-to-send queue — you
            send or use it from there. Reed never sends or executes anything itself.
          </p>
        </div>
        {reed.enabled && (
          <button
            onClick={() => reed.open({ surface: "reed_page" })}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3.5 py-2 rounded-full"
          >
            <ReedMark className="w-3.5 h-3.5" /> Ask Reed
          </button>
        )}
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

      {approved.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-orange mb-3">
            Approved — ready to send / use
          </h2>
          <div className="flex flex-col gap-3">
            {approved.map((d) => (
              <ApprovedCard key={d.id} draft={d} />
            ))}
          </div>
        </section>
      )}

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

      {proposals.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-orange mb-1">
            Strategy proposals
          </h2>
          <p className="text-[12px] text-ink-3 mb-3">
            Reed&apos;s proposed plan elements. Accepting adds the element to your plan; dismissing discards it.
          </p>
          <div className="flex flex-col gap-3">
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-orange mb-1">
          Conversation history
        </h2>
        <p className="text-[12px] text-ink-3 mb-3">
          Every question you&apos;ve asked Reed and his answer, saved permanently. Newest first.
        </p>
        {history.length === 0 ? (
          <Empty>No conversations yet. Ask Reed a question and it will be kept here.</Empty>
        ) : (
          <div className="flex flex-col gap-3 max-h-[36rem] overflow-y-auto pr-1">
            {history.map((t) => (
              <ThreadCard key={t.id} thread={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ThreadCard({ thread }: { thread: HistoryThread }) {
  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface p-4">
      <div className="text-[11px] text-ink-3 mb-2">{timeAgo(thread.created_at)}</div>
      <div className="flex flex-col gap-2.5">
        {thread.messages.map((m) => (
          <div key={m.id} className="flex gap-2.5">
            <span
              className={`shrink-0 mt-px text-[10px] font-heading font-bold uppercase ${
                m.role === "user" ? "text-orange-mid" : "text-ink-3"
              }`}
            >
              {m.role === "user" ? "Q" : "A"}
            </span>
            <p
              className={`min-w-0 text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "font-semibold text-ink-1" : "text-ink-2"
              }`}
            >
              {m.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const payload = proposal.payload ?? {};
  const title = typeof payload.title === "string" ? payload.title : "(untitled)";
  // Surface the few level fields people care about, skipping the title.
  const detail = Object.entries(payload)
    .filter(([k, v]) => k !== "title" && v != null && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
    .join(" · ");

  async function decide(action: "accept" | "dismiss") {
    setBusy(true);
    try {
      const res = await fetch(`/api/reed/proposals/${proposal.id}`, {
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
        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-orange/30 bg-orange/10 text-orange-mid">
          {PROPOSED_TYPE_LABEL[proposal.proposed_type] ?? proposal.proposed_type}
        </span>
      </div>
      <h3 className="font-heading font-semibold text-ink-1 text-sm">{title}</h3>
      {detail && <p className="mt-0.5 text-[12px] text-ink-3">{detail}</p>}
      {proposal.rationale && <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">{proposal.rationale}</p>}
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

function ApprovedCard({ draft }: { draft: Draft }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function discard() {
    setBusy(true);
    try {
      const res = await fetch(`/api/reed/drafts/${draft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard" }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border-[1.5px] border-orange/25 bg-orange-light/[0.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-heading font-semibold uppercase tracking-wider text-ink-3">
            {KIND_LABEL[draft.kind] ?? draft.kind}
          </span>
          <h3 className="font-heading font-semibold text-ink-1 text-sm mt-0.5">{draft.title ?? "Untitled draft"}</h3>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-ink-2 leading-relaxed whitespace-pre-wrap">{draft.body}</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={copy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full"
        >
          {copied ? "Copied ✓" : "Copy text"}
        </button>
        <button
          onClick={discard}
          disabled={busy}
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-3 py-1.5 rounded-full border border-white/10 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// The two typed extraction payloads the accept route can apply (spec #6,
// Phase 4). Rendered as an explicit "accepting will do X" line so the human
// knows accept means apply. A payload of any OTHER shape renders as plain
// JSON with no apply framing — the accept route also refuses to apply it.
function extractionSummary(payload: Record<string, unknown> | null): { text: string; unknown: boolean } | null {
  if (!payload) return null;
  if (payload.kind === "document_fields") {
    const parts: string[] = [];
    if (typeof payload.expires_at === "string") parts.push(`set expiry to ${payload.expires_at}`);
    if (typeof payload.doc_type === "string") parts.push(`set type to ${payload.doc_type}`);
    return { text: `Accepting will ${parts.join(" and ") || "update the document"} on the source document.`, unknown: false };
  }
  if (payload.kind === "obligation_task") {
    const due = typeof payload.due_date === "string" ? `, due ${payload.due_date}` : "";
    return { text: `Accepting will create the task "${String(payload.title ?? "")}"${due}, linked to the source document.`, unknown: false };
  }
  return { text: JSON.stringify(payload), unknown: true };
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const extraction = extractionSummary(suggestion.payload);

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
      {extraction && (
        <p className={`mt-1.5 text-xs leading-relaxed ${extraction.unknown ? "text-ink-3 font-mono break-all" : "text-ink-2 font-semibold"}`}>
          {extraction.unknown ? <>Unsupported proposal payload (nothing will be applied): {extraction.text}</> : extraction.text}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => decide("accept")}
          disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full disabled:opacity-50"
        >
          {extraction && !extraction.unknown ? "Accept & apply" : "Accept"}
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
