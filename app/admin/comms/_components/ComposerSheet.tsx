"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/Button";
import { TYPE } from "@/lib/admin/typeScale";
import { CHANNEL_LIST, type Channel } from "@/lib/comms/channels";

/**
 * The composer (spec §7.5): one story, many outputs.
 *
 * A right-hand sheet, not a page — you are still looking at the story. Never
 * more than one AI draft on screen; regenerating replaces it. Restraint over
 * abundance: three variants to choose between is a worse experience than one
 * to edit, and it invites picking rather than writing.
 *
 * On Bloom base (no ai.reed entitlement) the Draft button still works — it
 * opens a blank editor seeded with the story text, so the module is complete
 * and sellable without a single model call.
 */

type Metric = { id: string; name: string; unit: string | null; latest: number | null; stale: boolean };

type Draft = {
  id: string;
  channel: string;
  body: string;
  status: string;
};

export default function ComposerSheet({
  open,
  onClose,
  storyId,
  storyTitle,
  storyText,
  metrics,
  aiEnabled,
  publishable,
  blockedReason,
}: {
  open: boolean;
  onClose: () => void;
  storyId: string;
  storyTitle: string;
  storyText: string;
  metrics: Metric[];
  aiEnabled: boolean;
  publishable: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("linkedin");
  const [picked, setPicked] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [provenance, setProvenance] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/comms/stories/${storyId}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, metric_ids: picked }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; output?: Draft; provenance?: string }
        | null;
      if (!res.ok || !json?.output) {
        setError(json?.error ?? "The draft didn't come back.");
        return;
      }
      setDraft(json.output);
      setText(json.output.body);
      setProvenance(json.provenance ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function patch(payload: Record<string, unknown>) {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/comms/outputs/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; output?: Draft } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save that.");
        return;
      }
      if (json?.output) setDraft(json.output);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function startBlank() {
    // The base-tier path: a structured blank editor, prefilled with the story
    // so nobody starts from an empty box.
    setDraft(null);
    setProvenance(null);
    setText(storyText);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Turn this story into something"
        className="w-full sm:max-w-xl h-full bg-ink border-l-[1.5px] border-outline shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={TYPE.modalTitle}>Turn this into…</h2>
              <p className="text-xs text-ink-2 mt-0.5 line-clamp-1">{storyTitle}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          {!publishable && (
            <div className="rounded-card border border-status-critical/40 bg-status-critical-bg px-3 py-2">
              <p className="text-xs text-status-critical-text">
                <span className="font-semibold">Can&apos;t draft from this story.</span>{" "}
                {blockedReason ?? "It isn't approved and consented yet."}
              </p>
            </div>
          )}

          <div>
            <span className={TYPE.cardLabel}>Channel</span>
            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {CHANNEL_LIST.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setChannel(c.key)}
                  className={`text-left rounded-card px-3 py-2 border transition-colors ${
                    channel === c.key
                      ? "bg-orange/10 border-orange"
                      : "bg-tile border-hairline hover:border-outline"
                  }`}
                >
                  <span className="block text-xs font-semibold text-ink-1">{c.label}</span>
                  <span className="block text-[11px] text-ink-3 leading-snug mt-0.5">{c.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {metrics.length > 0 && (
            <div>
              <span className={TYPE.cardLabel}>Ground it in numbers</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {metrics.map((m) => {
                  const on = picked.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={m.latest === null}
                      onClick={() =>
                        setPicked((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))
                      }
                      title={m.latest === null ? "No value captured yet" : undefined}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors disabled:opacity-40 ${
                        on
                          ? "bg-orange text-white border-orange"
                          : "bg-tile text-ink-2 border-hairline hover:border-outline"
                      }`}
                    >
                      {m.name}
                      {m.latest !== null && (
                        <span className="ml-1 tabular-nums opacity-80">{m.latest}</span>
                      )}
                      {/* Staleness is stated, not hidden — the trust rule. */}
                      {m.stale && <span className="ml-1 text-status-watch-text">· stale</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-status-critical-text bg-status-critical-bg rounded-card px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {aiEnabled ? (
              <Button onClick={generate} disabled={busy || !publishable}>
                {busy ? "Drafting…" : draft ? "Regenerate" : "Draft it"}
              </Button>
            ) : (
              <Button onClick={startBlank} disabled={!publishable}>
                Start from the story
              </Button>
            )}
            {!aiEnabled && (
              <span className="text-[11px] text-ink-3">
                AI drafting is part of Bloom Grow.
              </span>
            )}
          </div>

          {(draft || text) && (
            <div className="space-y-2">
              {provenance && (
                // One line of provenance above every draft: what fed it, and
                // that names were removed. The claim is auditable in
                // comms_outputs.model_grounding.
                <p className="text-[11px] text-ink-3">{provenance}</p>
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                className="w-full rounded-card bg-tile border-[1.5px] border-outline px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-orange resize-y leading-relaxed"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
                {draft && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy || text === draft.body}
                      onClick={() => patch({ body: text })}
                    >
                      Save edits
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || draft.status === "approved"}
                      onClick={() => patch({ body: text, status: "approved" })}
                    >
                      {draft.status === "approved" ? "Approved" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        await patch({ status: "discarded" });
                        setDraft(null);
                        setText("");
                        setProvenance(null);
                      }}
                    >
                      Discard
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
