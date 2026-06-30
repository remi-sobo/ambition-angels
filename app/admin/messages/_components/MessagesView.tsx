"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, ThreadSummary } from "@/lib/messaging/threads";
import Button from "../../_components/Button";
import NewMessageModal from "./NewMessageModal";
import { AvatarStack, dayLabel, relTime, sameDay, shortTime } from "./Avatar";

type Person = { userId: string; name: string };
type LocalMessage = ChatMessage & { pending?: boolean };

const LIST_POLL_MS = 20000;
const CONVO_POLL_MS = 6000;

/** Tell the sidebar badge to re-poll the messages + notifications counts now. */
function pingBadges() {
  window.dispatchEvent(new Event("bloomos:messages-changed"));
  window.dispatchEvent(new Event("bloomos:notifications-changed"));
}

export default function MessagesView({
  me,
  threads: initialThreads,
  people,
  activeThreadId,
  initialMessages,
}: {
  me: Person;
  threads: ThreadSummary[];
  people: Person[];
  activeThreadId: string | null;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const active = threads.find((t) => t.id === activeThreadId) ?? null;

  // Mirror messages into a ref so the poll closure reads the latest tail
  // without re-subscribing every render.
  const messagesRef = useRef<LocalMessage[]>(initialMessages);
  messagesRef.current = messages;

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Server re-render (navigating to ?t=…) reseeds the open conversation.
  useEffect(() => {
    setMessages(initialMessages);
  }, [activeThreadId, initialMessages]);

  // Keep the latest threads when the server passes a fresher list.
  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  // Pin to the newest message whenever the open thread or its messages change.
  useEffect(() => {
    scrollToBottom();
  }, [activeThreadId, messages.length, scrollToBottom]);

  // Mark the open thread read, and optimistically clear its unread pill.
  useEffect(() => {
    if (!activeThreadId) return;
    setThreads((ts) => ts.map((t) => (t.id === activeThreadId ? { ...t, unread: 0 } : t)));
    fetch(`/api/admin/messages/${activeThreadId}/read`, { method: "POST" })
      .then(() => pingBadges())
      .catch(() => {});
  }, [activeThreadId]);

  // Thread-list refresh: slow poll + immediate on the same-tab event.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/admin/messages", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive && Array.isArray(j.threads)) setThreads(j.threads);
      } catch {
        // keep the last good list; next tick recovers
      }
    };
    const id = setInterval(load, LIST_POLL_MS);
    window.addEventListener("bloomos:messages-changed", load);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("bloomos:messages-changed", load);
    };
  }, []);

  // Open-conversation poll: fetch only messages newer than the last real one,
  // and only while the tab is visible.
  useEffect(() => {
    if (!activeThreadId) return;
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      const real = messagesRef.current.filter((m) => !m.pending);
      const after = real.length ? real[real.length - 1].createdAt : null;
      try {
        const url = `/api/admin/messages/${activeThreadId}/messages${
          after ? `?after=${encodeURIComponent(after)}` : ""
        }`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const incoming = (j.messages ?? []) as ChatMessage[];
        if (!alive || incoming.length === 0) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = incoming.filter((m) => !seen.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
        // A reply landing means our standing Inbox pointer cleared elsewhere.
        if (incoming.some((m) => !m.mine)) {
          fetch(`/api/admin/messages/${activeThreadId}/read`, { method: "POST" })
            .then(() => pingBadges())
            .catch(() => {});
        }
      } catch {
        // transient; next tick retries
      }
    };
    const id = setInterval(tick, CONVO_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [activeThreadId]);

  const openThread = (id: string) => router.push(`/admin/messages?t=${id}`);
  const backToList = () => router.push("/admin/messages");

  async function send() {
    const text = draft.trim();
    if (!text || !activeThreadId) return;
    setDraft("");
    const temp: LocalMessage = {
      id: `temp-${Date.now()}`,
      threadId: activeThreadId,
      senderId: me.userId,
      senderName: me.name,
      body: text,
      createdAt: new Date().toISOString(),
      mine: true,
      pending: true,
    };
    setMessages((m) => [...m, temp]);
    try {
      const r = await fetch(`/api/admin/messages/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const j = await r.json();
      if (r.ok && j.message) {
        setMessages((m) => m.map((x) => (x.id === temp.id ? (j.message as LocalMessage) : x)));
      } else {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setDraft(text);
      }
    } catch {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setDraft(text);
    }
    pingBadges();
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-0.5rem-env(safe-area-inset-top))] px-3 lg:px-6 py-3 lg:py-4">
      <div className="flex-1 min-h-0 flex rounded-card-lg border border-hairline bg-surface shadow-tile overflow-hidden">
        {/* ── Thread list ─────────────────────────────────────────────── */}
        <aside
          className={`w-full lg:w-[320px] shrink-0 flex-col border-hairline lg:border-r min-h-0 ${
            active ? "hidden lg:flex" : "flex"
          }`}
        >
          <header className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-hairline">
            <h1 className="font-heading font-bold text-lg text-ink-1">Messages</h1>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              New
            </Button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {threads.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-ink-2">No conversations yet.</p>
                <button
                  type="button"
                  onClick={() => setNewOpen(true)}
                  className="mt-2 text-sm font-semibold text-orange hover:text-orange-dark"
                >
                  Start one →
                </button>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {threads.map((t) => {
                  const isActive = t.id === activeThreadId;
                  const unread = t.unread > 0;
                  const preview = t.lastMessage
                    ? `${t.lastMessage.senderId === me.userId ? "You: " : t.isGroup ? `${firstName(t.lastMessage.senderName)}: ` : ""}${t.lastMessage.body}`
                    : "No messages yet";
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => openThread(t.id)}
                        className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-card text-left transition-colors ${
                          isActive ? "bg-orange-light" : "hover:bg-tile"
                        }`}
                      >
                        <AvatarStack people={t.others.length ? t.others : t.participants} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${
                                unread ? "font-bold text-ink-1" : "font-semibold text-ink-1"
                              }`}
                            >
                              {t.label}
                            </span>
                            {t.lastMessage && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-3">
                                {relTime(t.lastMessageAt)}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`min-w-0 flex-1 truncate text-xs ${
                                unread ? "text-ink-1 font-medium" : "text-ink-2"
                              }`}
                            >
                              {preview}
                            </span>
                            {unread && (
                              <span className="shrink-0 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-orange text-white text-[10px] font-bold leading-none">
                                {t.unread > 9 ? "9+" : t.unread}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Conversation ────────────────────────────────────────────── */}
        <section className={`flex-1 min-w-0 flex-col min-h-0 ${active ? "flex" : "hidden lg:flex"}`}>
          {!active ? (
            <div className="flex-1 hidden lg:flex flex-col items-center justify-center text-center px-8">
              <span className="w-14 h-14 rounded-full bg-tile border border-hairline flex items-center justify-center text-ink-3 mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <p className="text-sm text-ink-2 max-w-xs">
                Select a conversation, or start a new one to message your team.
              </p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 px-3 lg:px-5 py-3 border-b border-hairline">
                <button
                  type="button"
                  onClick={backToList}
                  className="lg:hidden -ml-1 w-9 h-9 flex items-center justify-center rounded-full text-ink-2 hover:bg-tile"
                  aria-label="Back to conversations"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <AvatarStack people={active.others.length ? active.others : active.participants} size={36} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="font-heading font-semibold text-ink-1 truncate">{active.label}</div>
                  {active.isGroup && (
                    <div className="text-[11px] text-ink-3 truncate">
                      {active.participants.length} people ·{" "}
                      {active.participants.map((p) => firstName(p.name)).join(", ")}
                    </div>
                  )}
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 lg:px-5 py-4 bg-app/40">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <p className="text-sm text-ink-2">No messages yet.</p>
                    <p className="text-xs text-ink-3 mt-0.5">Say hello 👋</p>
                  </div>
                ) : (
                  <MessageStream messages={messages} isGroup={active.isGroup} />
                )}
              </div>

              <Composer draft={draft} setDraft={setDraft} onSend={send} />
            </>
          )}
        </section>
      </div>

      {newOpen && (
        <NewMessageModal
          people={people}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            openThread(id);
            window.dispatchEvent(new Event("bloomos:messages-changed"));
          }}
        />
      )}
    </div>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// ── Message stream: day dividers + grouped runs ──────────────────────────────

function MessageStream({ messages, isGroup }: { messages: LocalMessage[]; isGroup: boolean }) {
  const RUN_GAP_MS = 5 * 60 * 1000;
  return (
    <div className="space-y-0.5">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const showDivider = !prev || !sameDay(prev.createdAt, m.createdAt);
        const startRun =
          showDivider ||
          !prev ||
          prev.senderId !== m.senderId ||
          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > RUN_GAP_MS;
        const endRun =
          !next ||
          next.senderId !== m.senderId ||
          !sameDay(next.createdAt, m.createdAt) ||
          new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > RUN_GAP_MS;

        return (
          <div key={m.id}>
            {showDivider && (
              <div className="flex items-center gap-3 my-4">
                <span className="flex-1 h-px bg-hairline" />
                <span className="text-[10px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3">
                  {dayLabel(m.createdAt)}
                </span>
                <span className="flex-1 h-px bg-hairline" />
              </div>
            )}
            <Bubble
              m={m}
              showName={startRun && !m.mine && isGroup}
              showTime={endRun}
              tight={!startRun}
            />
          </div>
        );
      })}
    </div>
  );
}

function Bubble({
  m,
  showName,
  showTime,
  tight,
}: {
  m: LocalMessage;
  showName: boolean;
  showTime: boolean;
  tight: boolean;
}) {
  return (
    <div className={`flex ${m.mine ? "justify-end" : "justify-start"} ${tight ? "mt-0.5" : "mt-2"}`}>
      <div className={`flex flex-col max-w-[80%] ${m.mine ? "items-end" : "items-start"}`}>
        {showName && (
          <span className="text-[11px] font-semibold text-ink-3 px-1 mb-0.5">{m.senderName}</span>
        )}
        <div
          className={`px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words rounded-card ${
            m.mine
              ? `bg-orange text-white ${m.pending ? "opacity-60" : ""}`
              : "bg-surface text-ink-1 border border-hairline"
          }`}
        >
          {m.body}
        </div>
        {showTime && (
          <span className="text-[10px] text-ink-3 px-1 mt-0.5">
            {m.pending ? "Sending…" : shortTime(m.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────

function Composer({
  draft,
  setDraft,
  onSend,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [draft, autoGrow]);

  return (
    <div className="border-t border-hairline px-3 lg:px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2 bg-tile border border-outline rounded-card-lg px-3 py-2 focus-within:border-orange transition-colors">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder="Write a message…"
          className="flex-1 resize-none bg-transparent text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none leading-relaxed max-h-40"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!draft.trim()}
          aria-label="Send message"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-orange text-white hover:bg-orange-dark transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
