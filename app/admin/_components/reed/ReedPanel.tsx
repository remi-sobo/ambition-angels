"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Reed's conversation drawer — the one real Reed UI, summoned from any surface.
 * The "Ask Reed" FAB (mobile) and the right rail's capture-to-Reed escalation
 * (desktop) both open this via ReedLauncherProvider, passing an optional draft
 * (prefills the ask bar) and context_ref (the record the user was looking at,
 * which Reed folds into its system prompt). Talks to /api/reed/ask — read-only,
 * RLS-scoped; Reed drafts and proposes but never sends or mutates.
 *
 * Espresso surface on purpose: Reed is the one summoned, high-emphasis lane, so
 * it reads as a distinct dark moment against the cream workspace and the warm
 * right rail.
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

export default function ReedPanel({
  onClose,
  initialDraft = "",
  contextRef = null,
  surface = "fab",
}: {
  onClose: () => void;
  /** Prefills the ask bar — e.g. text escalated from the rail's capture box. */
  initialDraft?: string;
  /** The record the user was on, handed to Reed as context. */
  contextRef?: Record<string, unknown> | null;
  /** Which surface opened Reed (logged on the orchestrator). */
  surface?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  // Tracks the iOS visual viewport so the full-screen mobile sheet shrinks to
  // sit above the on-screen keyboard (and follows it as it opens/closes)
  // instead of the ask bar getting buried under it.
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Lock background scroll while open so the workspace doesn't bounce behind
  // the sheet on iOS.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Follow the visual viewport (keyboard show/hide, address-bar collapse).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
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
        body: JSON.stringify({ message: trimmed, surface, thread_id: threadId, context_ref: contextRef }),
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
    <div
      className="fixed inset-x-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Reed"
      style={{ top: viewport?.top ?? 0, height: viewport ? `${viewport.height}px` : "100dvh" }}
    >
      <button aria-label="Close Reed" onClick={onClose} className="absolute inset-0 bg-ink/50 cursor-default" />

      <aside className="relative z-10 flex h-full w-full flex-col bg-navy text-cream shadow-2xl sm:max-w-sm">
        {/* header — faint dot texture for warmth on the dark surface */}
        <div
          className="flex items-center justify-between gap-3 border-b border-white/10 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
              <ReedMark className="w-4 h-4 text-orange-mid" />
            </span>
            <div className="leading-tight">
              <div className="font-heading font-bold text-cream">Reed</div>
              <div className="text-[11px] text-cream/50">Your BloomOS assistant</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-cream/55 hover:text-cream transition-colors text-xl leading-none">
            ×
          </button>
        </div>

        {/* body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
          {empty ? (
            <>
              <p className="text-sm text-cream/70 leading-relaxed">
                Reed reasons across your BloomOS data — fundraising, finance, program, ops. Ask a
                question, or jump to one of his pre-aimed jobs:
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {REED_JOBS.map((job) => (
                  <Link
                    key={job.href}
                    href={job.href}
                    onClick={onClose}
                    className="group rounded-card border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-orange/40 hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-semibold text-cream text-sm">{job.label}</span>
                      <span className="text-cream/50 group-hover:text-orange transition-colors">→</span>
                    </div>
                    <span className="text-[12px] text-cream/50">{job.blurb}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-cream/70 hover:border-orange/40 hover:text-cream transition-colors"
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
                <div className="flex items-center gap-2 text-[12px] text-cream/50">
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
          className="border-t border-white/10 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 focus-within:border-orange/40">
            <ReedMark className="w-4 h-4 text-cream/40 shrink-0" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              autoFocus
              placeholder="Ask Reed anything…"
              className="flex-1 bg-transparent text-sm text-cream placeholder:text-cream/40 outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="text-orange-mid disabled:text-cream/30 transition-colors text-lg leading-none"
            >
              ↑
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-cream/50">Reed explains, recommends, and drafts for your review — he never sends or changes anything.</p>
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
      <div className="rounded-card rounded-bl-sm bg-white/8 px-3.5 py-2 text-sm text-cream whitespace-pre-wrap">{message.text}</div>
    </div>
  );
}

/** Reed's mark — a four-point sparkle, the AI glyph used across his surfaces. */
export function ReedMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z" />
    </svg>
  );
}
