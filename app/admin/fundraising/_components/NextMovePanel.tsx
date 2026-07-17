"use client";

// Reed's next move for the person whose profile you're on: one grounded
// suggestion + a ready-to-send email draft, without leaving Bloom. Cached
// server-side (reed_next_moves) so rendering a profile never spends tokens —
// only the Generate/Refresh button does. From here you can copy the draft,
// open it in your mail client, or turn the move into a linked task.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NextMoveRecord } from "@/lib/agents/next-move/types";
import { TYPE } from "@/lib/admin/typeScale";

const CHANNEL_STYLE: Record<string, string> = {
  email: "bg-blue-500/15 text-blue-400",
  call: "bg-orange/15 text-orange",
  meeting: "bg-revenue/15 text-revenue",
  note: "bg-tile text-ink-2 border border-outline",
  wait: "bg-tile text-ink-3 border border-outline",
  other: "bg-tile text-ink-3 border border-outline",
};

export default function NextMovePanel({
  entityType,
  entityId,
  entityLabel,
  email,
}: {
  entityType: "constituent" | "fr_prospects";
  entityId: string;
  entityLabel: string;
  /** The person's email, for the mailto handoff. */
  email: string | null;
}) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<NextMoveRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/admin/fundraising/next-move?entity_type=${entityType}&entity_id=${entityId}`
      );
      if (r.ok) {
        const j = (await r.json()) as { suggestion: NextMoveRecord | null };
        setSuggestion(j.suggestion);
      }
    } finally {
      setLoaded(true);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setTaskDone(false);
    try {
      const r = await fetch("/api/admin/fundraising/next-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
      });
      const j = (await r.json().catch(() => ({}))) as { suggestion?: NextMoveRecord; error?: string };
      if (!r.ok) {
        setError(
          r.status === 503
            ? "AI isn't configured (ANTHROPIC_API_KEY)."
            : j.error ?? `HTTP ${r.status}`
        );
        return;
      }
      if (j.suggestion) setSuggestion(j.suggestion);
    } catch {
      setError("Could not reach the agent. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const decide = (status: "applied" | "dismissed") => {
    if (!suggestion) return;
    void fetch("/api/admin/fundraising/next-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, decide: status, suggestion_id: suggestion.id }),
    });
  };

  const makeTask = async () => {
    if (!suggestion) return;
    setTaskBusy(true);
    try {
      const due = new Date(Date.now() + suggestion.dueInDays * 86400000).toISOString().slice(0, 10);
      const r = await fetch("/api/admin/ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: suggestion.action,
          category: "fundraising",
          priority: "medium",
          due_date: due,
          assigned_to: "remi",
          linked_entity_type: entityType,
          linked_entity_id: entityId,
          linked_label: entityLabel,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      decide("applied");
      setTaskDone(true);
      router.refresh();
    } catch {
      alert("Could not create the task — try again.");
    } finally {
      setTaskBusy(false);
    }
  };

  const copyEmail = () => {
    if (!suggestion?.emailBody) return;
    const text = suggestion.emailSubject
      ? `Subject: ${suggestion.emailSubject}\n\n${suggestion.emailBody}`
      : suggestion.emailBody;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const dismiss = () => {
    decide("dismissed");
    setSuggestion(null);
    setTaskDone(false);
  };

  const mailto =
    suggestion?.emailBody && email
      ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(suggestion.emailSubject ?? "")}&body=${encodeURIComponent(suggestion.emailBody)}`
      : null;

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-orange/25 rounded-card-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className={TYPE.cardTitle}>
            Next move <span className="text-ink-3 font-normal">· Reed</span>
          </h2>
          <p className="text-[11px] text-ink-3">
            Grounded in {entityLabel}&rsquo;s giving, conversations, and research on file. Nothing sends
            without you.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="text-xs font-semibold px-4 py-2 rounded-full border-[1.5px] border-orange/40 bg-orange/10 text-orange hover:bg-orange/20 transition-colors disabled:opacity-60"
        >
          {generating ? "Thinking…" : suggestion ? "Refresh" : "Suggest next move"}
        </button>
      </div>

      {error && <p className="px-5 py-3 text-sm text-expense">{error}</p>}

      {!error && loaded && !suggestion && !generating && (
        <p className="px-5 py-4 text-ink-3 text-sm">
          Ask Reed for the single best next move with {entityLabel} — and the email to send, drafted
          from the real history. Costs a few cents per run.
        </p>
      )}

      {suggestion && (
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-2 flex-wrap">
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize mt-0.5 ${CHANNEL_STYLE[suggestion.channel] ?? CHANNEL_STYLE.other}`}
            >
              {suggestion.channel}
            </span>
            <p className="text-sm font-medium text-ink-1 flex-1 min-w-[200px]">{suggestion.action}</p>
            <span className="text-[11px] text-ink-3 whitespace-nowrap">
              {suggestion.dueInDays === 0 ? "today" : `in ${suggestion.dueInDays} day${suggestion.dueInDays === 1 ? "" : "s"}`}
            </span>
          </div>
          <p className="text-xs text-ink-3 leading-snug">{suggestion.rationale}</p>

          {suggestion.emailBody && (
            <div className="bg-cream border-[1.5px] border-outline rounded-xl p-4">
              {suggestion.emailSubject && (
                <p className="text-xs font-semibold text-ink-1 mb-2">
                  <span className="text-ink-3 font-normal">Subject:</span> {suggestion.emailSubject}
                </p>
              )}
              <p className="text-sm text-ink-1 whitespace-pre-wrap leading-relaxed">{suggestion.emailBody}</p>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-1">
            {taskDone ? (
              <span className="text-xs text-revenue font-semibold">Task created ✓</span>
            ) : (
              <button
                type="button"
                onClick={makeTask}
                disabled={taskBusy}
                className="text-xs font-semibold px-4 py-2 rounded-full bg-orange text-white hover:bg-orange-dark transition-colors disabled:opacity-60"
              >
                {taskBusy ? "…" : "Make it a task"}
              </button>
            )}
            {suggestion.emailBody && (
              <button
                type="button"
                onClick={copyEmail}
                className="text-xs font-semibold px-4 py-2 rounded-full border-[1.5px] border-outline bg-tile text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4] transition-colors"
              >
                {copied ? "Copied ✓" : "Copy email"}
              </button>
            )}
            {mailto && (
              <a
                href={mailto}
                className="text-xs font-semibold px-4 py-2 rounded-full border-[1.5px] border-outline bg-tile text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4] transition-colors"
              >
                Open in mail ↗
              </a>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="ml-auto text-xs font-semibold px-3 py-2 rounded-full text-ink-3 hover:text-ink-1 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
