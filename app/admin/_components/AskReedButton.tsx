"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * "Ask Reed" — the global entry point to the BloomOS assistant. Lives in the
 * admin layout (Reed Phase 3), mounted only when the org holds the `ai.reed`
 * entitlement. Phase 4 wires the ask bar to the /api/reed/ask orchestrator:
 * Reed answers read-only questions from the org's real data, RLS-scoped to the
 * asking user. The entitlement is re-checked server-side on every call — this
 * FAB is an affordance, not the boundary.
 *
 * Sits to the left of the QuickAdd "+" FAB so the two don't collide.
 */

type ReedJob = { label: string; blurb: string; href: string };

const REED_JOBS: ReedJob[] = [
  { label: "Morning brief", blurb: "Reed's read on what matters today", href: "/admin/briefing" },
  { label: "Funder research", blurb: "Deep-research a prospect into a brief", href: "/admin/fundraising/prospects" },
  { label: "Next best action", blurb: "Who to move, and how, this week", href: "/admin/fundraising" },
];

const STARTERS = [
  "Are we okay on money against the goal?",
  "What grant deadlines are coming up?",
  "How much runway do we have?",
];

type ChatMessage = { role: "user" | "assistant"; text: string };

export default function AskReedButton() {
  const [open, setOpen] = useState(false);
  // Surface + optional seed prompt for this opening. Any page can launch Reed
  // pre-aimed by dispatching `window.dispatchEvent(new CustomEvent("reed:open",
  // { detail: { surface, message } }))` — e.g. the strategy page's "Review with
  // Reed" button.
  const [opener, setOpener] = useState<{ surface: string; seedPrompt?: string }>({ surface: "fab" });

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as { surface?: unknown; message?: unknown };
      setOpener({
        surface: typeof detail.surface === "string" ? detail.surface : "fab",
        seedPrompt: typeof detail.message === "string" ? detail.message : undefined,
      });
      setOpen(true);
    };
    window.addEventListener("reed:open", onOpen);
    return () => window.removeEventListener("reed:open", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const fabOffset = {
    right: "max(calc(1.5rem + 4rem), calc(env(safe-area-inset-right) + 4rem))",
    bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
  };

  return (
    <>
      <button
        onClick={() => {
          setOpener({ surface: "fab" });
          setOpen(true);
        }}
        aria-label="Ask Reed"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed z-40 w-14 h-14 rounded-full bg-navy hover:bg-[#19305f] text-white shadow-2xl shadow-navy/30 flex items-center justify-center transition-transform active:scale-95"
        style={fabOffset}
      >
        <ReedMark className="w-6 h-6 text-orange-mid" />
      </button>

      {open && <ReedPanel surface={opener.surface} seedPrompt={opener.seedPrompt} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReedPanel({ onClose, surface, seedPrompt }: { onClose: () => void; surface: string; seedPrompt?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Auto-send a seed prompt (e.g. opened from a record with "Review with Reed").
  useEffect(() => {
    if (seedPrompt && !seeded.current) {
      seeded.current = true;
      void send(seedPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setNotice(null);
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setBusy(true);
    try {
      const res = await fetch("/api/reed/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, surface, thread_id: threadId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        thread_id?: string | null;
        budgetWarning?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setNotice(data.error ?? "Reed couldn't answer that.");
      } else {
        if (data.thread_id) setThreadId(data.thread_id);
        if (data.budgetWarning) setNotice(data.budgetWarning);
        setMessages((m) => [...m, { role: "assistant", text: data.text ?? "(no answer)" }]);
      }
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Reed">
      <button aria-label="Close Reed" onClick={onClose} className="absolute inset-0 bg-ink/50 cursor-default" />

      <aside className="relative z-10 flex h-full w-full max-w-sm flex-col bg-ink text-ink-1 shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy">
              <ReedMark className="w-4 h-4 text-orange-mid" />
            </span>
            <div className="leading-tight">
              <div className="font-heading font-bold text-cream">Reed</div>
              <div className="text-[11px] text-ink-3">Your BloomOS assistant</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-cream transition-colors text-xl leading-none">
            ×
          </button>
        </div>

        {/* body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
          {empty ? (
            <>
              <p className="text-sm text-ink-2 leading-relaxed">
                Reed reasons across your BloomOS data — fundraising, finance, program, ops. Ask a
                question, or jump to one of his pre-aimed jobs:
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {REED_JOBS.map((job) => (
                  <Link
                    key={job.href}
                    href={job.href}
                    onClick={onClose}
                    className="group rounded-card border border-white/10 bg-surface/40 px-4 py-3 transition-colors hover:border-orange/40 hover:bg-surface/70"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-semibold text-cream text-sm">{job.label}</span>
                      <span className="text-ink-3 group-hover:text-orange transition-colors">→</span>
                    </div>
                    <span className="text-[12px] text-ink-3">{job.blurb}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-white/10 bg-surface/40 px-3 py-1.5 text-[12px] text-ink-2 hover:border-orange/40 hover:text-cream transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Link
                href="/admin/reed"
                onClick={onClose}
                className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-orange-mid hover:text-orange transition-colors"
              >
                Review Reed&apos;s drafts &amp; suggestions →
              </Link>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-[12px] text-ink-3">
                  <ReedMark className="w-3.5 h-3.5 animate-pulse" /> Reed is thinking…
                </div>
              )}
            </div>
          )}
          {notice && <p className="mt-3 rounded-card border border-orange/30 bg-orange/10 px-3 py-2 text-[12px] text-orange-mid">{notice}</p>}
        </div>

        {/* ask bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-white/10 px-5 py-4"
        >
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-surface/40 px-4 py-2.5 focus-within:border-orange/40">
            <ReedMark className="w-4 h-4 text-ink-3 shrink-0" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="Ask Reed anything…"
              className="flex-1 bg-transparent text-sm text-cream placeholder:text-ink-3 outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="text-orange-mid disabled:text-ink-3 transition-colors text-lg leading-none"
            >
              ↑
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-3">Reed explains, recommends, and drafts for your review — he never sends or changes anything.</p>
        </form>
      </aside>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="self-end max-w-[85%] rounded-card rounded-br-sm bg-orange/90 px-3.5 py-2 text-sm text-white whitespace-pre-wrap">
        {message.text}
      </div>
    );
  }
  return (
    <div className="self-start flex gap-2 max-w-[90%]">
      <ReedMark className="w-4 h-4 text-orange-mid shrink-0 mt-1" />
      <div className="rounded-card rounded-bl-sm bg-surface/60 px-3.5 py-2 text-sm text-ink-1 whitespace-pre-wrap">{message.text}</div>
    </div>
  );
}

/** Reed's mark — a four-point sparkle, the AI glyph used across his surfaces. */
function ReedMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z" />
    </svg>
  );
}
