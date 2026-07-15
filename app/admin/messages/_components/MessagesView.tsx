"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, MessageReaction, ThreadReadMember, ThreadSummary } from "@/lib/messaging/threads";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import Button from "../../_components/Button";
import NewMessageModal from "./NewMessageModal";
import { AvatarStack, dayLabel, relTime, sameDay, shortTime } from "./Avatar";
import { TYPE } from "@/lib/admin/typeScale";

type Person = { userId: string; name: string };
type LocalMessage = ChatMessage & { pending?: boolean };

const LIST_POLL_MS = 20000;
const CONVO_POLL_MS = 6000;
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];

/** Tell the sidebar badge to re-poll the messages + notifications counts now. */
function pingBadges() {
  window.dispatchEvent(new Event("bloomos:messages-changed"));
  window.dispatchEvent(new Event("bloomos:notifications-changed"));
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function dropOne(names: string[], name: string): string[] {
  const i = names.indexOf(name);
  if (i < 0) return names;
  const out = names.slice();
  out.splice(i, 1);
  return out;
}

/** Toggle MY reaction on a message locally (optimistic). */
function toggleMyReaction(m: LocalMessage, emoji: string, myName: string): LocalMessage {
  const chips = m.reactions.map((c) => ({ ...c, names: [...c.names] }));
  const idx = chips.findIndex((c) => c.emoji === emoji);
  if (idx >= 0) {
    const c = chips[idx];
    if (c.mine) {
      if (c.count <= 1) chips.splice(idx, 1);
      else chips[idx] = { ...c, count: c.count - 1, mine: false, names: dropOne(c.names, myName) };
    } else {
      chips[idx] = { ...c, count: c.count + 1, mine: true, names: [...c.names, myName] };
    }
  } else {
    chips.push({ emoji, count: 1, mine: true, names: [myName] });
  }
  return { ...m, reactions: chips };
}

/** Apply a remote reaction change (+1 / -1) by someone else. */
function applyRemoteReaction(
  m: LocalMessage,
  emoji: string,
  name: string,
  delta: 1 | -1
): LocalMessage {
  const chips = m.reactions.map((c) => ({ ...c, names: [...c.names] }));
  const idx = chips.findIndex((c) => c.emoji === emoji);
  if (delta > 0) {
    if (idx >= 0) chips[idx] = { ...chips[idx], count: chips[idx].count + 1, names: [...chips[idx].names, name] };
    else chips.push({ emoji, count: 1, mine: false, names: [name] });
  } else if (idx >= 0) {
    const count = chips[idx].count - 1;
    if (count <= 0) chips.splice(idx, 1);
    else chips[idx] = { ...chips[idx], count, names: dropOne(chips[idx].names, name) };
  }
  return { ...m, reactions: chips };
}

export default function MessagesView({
  me,
  orgId,
  threads: initialThreads,
  people,
  activeThreadId,
  initialMessages,
  initialReadState,
}: {
  me: Person;
  orgId: string;
  threads: ThreadSummary[];
  people: Person[];
  activeThreadId: string | null;
  initialMessages: ChatMessage[];
  initialReadState: ThreadReadMember[];
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [readState, setReadState] = useState<ThreadReadMember[]>(initialReadState);
  const [draft, setDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const active = threads.find((t) => t.id === activeThreadId) ?? null;

  // Mirror messages into a ref so the poll closure reads the latest tail
  // without re-subscribing every render.
  const messagesRef = useRef<LocalMessage[]>(initialMessages);
  messagesRef.current = messages;

  // Refs the single Realtime channel reads without re-subscribing per thread.
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  const nameLookupRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = { [me.userId]: me.name };
    for (const t of threads) for (const p of t.participants) map[p.userId] = p.name;
    nameLookupRef.current = map;
  }, [threads, me.userId, me.name]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Server re-render (navigating to ?t=…) reseeds the open conversation.
  useEffect(() => {
    setMessages(initialMessages);
  }, [activeThreadId, initialMessages]);
  useEffect(() => {
    setReadState(initialReadState);
  }, [activeThreadId, initialReadState]);

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

  // Open-conversation poll (fallback): full refresh so edits/deletes/reactions
  // on existing messages reconcile even if a Realtime event was missed.
  useEffect(() => {
    if (!activeThreadId) return;
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/admin/messages/${activeThreadId}/messages`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const incoming = (j.messages ?? []) as ChatMessage[];
        if (!alive) return;
        setMessages((prev) => {
          const pending = prev.filter((m) => m.pending);
          const serverIds = new Set(incoming.map((m) => m.id));
          // Server snapshot + any still-in-flight optimistic messages.
          return [...incoming, ...pending.filter((p) => !serverIds.has(p.id))];
        });
        if (Array.isArray(j.readState)) setReadState(j.readState);
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

  // Realtime: one org-scoped channel (RLS only delivers rows in my threads),
  // subscribed once; reads the open thread + names from refs. Covers new
  // messages, edits/deletes, reactions, and read receipts. My own actions are
  // applied optimistically, so most "mine" events are no-ops here.
  useEffect(() => {
    if (!orgId) return;
    const supabase = getSupabaseBrowser();
    const inActive = (threadId: string) => threadId === activeThreadIdRef.current;

    const channel = supabase
      .channel(`org-messages:${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as { id: string; thread_id: string; sender_id: string; body: string; created_at: string };
          if (inActive(row.thread_id) && row.sender_id !== me.userId) {
            setMessages((prev) =>
              prev.some((m) => m.id === row.id)
                ? prev
                : [
                    ...prev,
                    {
                      id: row.id,
                      threadId: row.thread_id,
                      senderId: row.sender_id,
                      senderName: nameLookupRef.current[row.sender_id] ?? "Teammate",
                      body: row.body,
                      createdAt: row.created_at,
                      mine: false,
                      editedAt: null,
                      deletedAt: null,
                      reactions: [],
                    },
                  ]
            );
            fetch(`/api/admin/messages/${row.thread_id}/read`, { method: "POST" }).catch(() => {});
          }
          pingBadges();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as { id: string; thread_id: string; body: string; edited_at: string | null; deleted_at: string | null };
          if (inActive(row.thread_id)) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === row.id
                  ? {
                      ...m,
                      body: row.deleted_at ? "" : row.body,
                      editedAt: row.edited_at,
                      deletedAt: row.deleted_at,
                      reactions: row.deleted_at ? [] : m.reactions,
                    }
                  : m
              )
            );
          }
          pingBadges();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string; emoji: string };
          if (row.user_id === me.userId) return; // mine is optimistic
          const name = nameLookupRef.current[row.user_id] ?? "Teammate";
          setMessages((prev) => prev.map((m) => (m.id === row.message_id ? applyRemoteReaction(m, row.emoji, name, 1) : m)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.old as { message_id: string; user_id: string; emoji: string };
          if (!row || row.user_id === me.userId) return;
          const name = nameLookupRef.current[row.user_id] ?? "Teammate";
          setMessages((prev) => prev.map((m) => (m.id === row.message_id ? applyRemoteReaction(m, row.emoji, name, -1) : m)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_thread_members", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as { thread_id: string; user_id: string; last_read_at: string | null };
          if (!inActive(row.thread_id) || row.user_id === me.userId) return;
          setReadState((prev) =>
            prev.map((r) => (r.userId === row.user_id ? { ...r, lastReadAt: row.last_read_at } : r))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, me.userId]);

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
      editedAt: null,
      deletedAt: null,
      reactions: [],
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
        const real = j.message as LocalMessage;
        setMessages((m) => [...m.filter((x) => x.id !== temp.id && x.id !== real.id), real]);
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

  async function react(messageId: string, emoji: string) {
    if (!activeThreadId) return;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? toggleMyReaction(m, emoji, me.name) : m)));
    try {
      await fetch(`/api/admin/messages/${activeThreadId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
    } catch {
      // revert by toggling back; rare, low-stakes
      setMessages((prev) => prev.map((m) => (m.id === messageId ? toggleMyReaction(m, emoji, me.name) : m)));
    }
  }

  function startEdit(m: LocalMessage) {
    setEditingId(m.id);
    setEditText(m.body);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }
  async function saveEdit() {
    const id = editingId;
    const text = editText.trim();
    if (!id || !activeThreadId) return cancelEdit();
    if (!text) return cancelEdit();
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, body: text, editedAt: new Date().toISOString() } : m))
    );
    cancelEdit();
    try {
      await fetch(`/api/admin/messages/${activeThreadId}/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
    } catch {
      // poll/realtime will reconcile
    }
  }
  async function del(id: string) {
    if (!activeThreadId) return;
    if (!window.confirm("Delete this message?")) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, body: "", deletedAt: new Date().toISOString(), reactions: [] } : m))
    );
    try {
      await fetch(`/api/admin/messages/${activeThreadId}/messages/${id}`, { method: "DELETE" });
    } catch {
      // poll/realtime will reconcile
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
            {/* One-line purpose note so operators can tell this apart from the
                Inbox notification feed (which only gets a pointer per unread
                conversation — the chat itself lives here). */}
            <div className="min-w-0">
              <h1 className={`${TYPE.sectionTitle} leading-tight`}>Messages</h1>
              <p className="text-[11px] text-ink-3 truncate">
                Chat with your team — alerts &amp; mentions live in Inbox
              </p>
            </div>
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
                  <MessageStream
                    messages={messages}
                    isGroup={active.isGroup}
                    readState={readState}
                    editingId={editingId}
                    editText={editText}
                    setEditText={setEditText}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onReact={react}
                    onStartEdit={startEdit}
                    onDelete={del}
                  />
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

// ── Message stream: day dividers, grouped runs, receipts ─────────────────────

function MessageStream({
  messages,
  isGroup,
  readState,
  editingId,
  editText,
  setEditText,
  onSaveEdit,
  onCancelEdit,
  onReact,
  onStartEdit,
  onDelete,
}: {
  messages: LocalMessage[];
  isGroup: boolean;
  readState: ThreadReadMember[];
  editingId: string | null;
  editText: string;
  setEditText: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onStartEdit: (m: LocalMessage) => void;
  onDelete: (id: string) => void;
}) {
  const RUN_GAP_MS = 5 * 60 * 1000;

  // The receipt sits under the last message I sent (live, not deleted) that
  // someone else has read past.
  let receiptIndex = -1;
  let receiptText: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.mine && !m.deletedAt && !m.pending) {
      const t = new Date(m.createdAt).getTime();
      const seenBy = readState
        .filter((r) => r.lastReadAt && new Date(r.lastReadAt).getTime() >= t)
        .map((r) => firstName(r.name));
      if (seenBy.length) {
        receiptIndex = i;
        receiptText = isGroup ? `Seen by ${seenBy.join(", ")}` : "Seen";
      }
      break;
    }
  }

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
              editing={editingId === m.id}
              editText={editText}
              setEditText={setEditText}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onReact={onReact}
              onStartEdit={onStartEdit}
              onDelete={onDelete}
            />
            {receiptIndex === i && receiptText && (
              <div className="flex justify-end pr-1 mt-0.5">
                <span className="inline-flex items-center gap-1 text-[10px] text-ink-3">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 13l4 4 7-9M12 16l1.5 1.5 7-9" />
                  </svg>
                  {receiptText}
                </span>
              </div>
            )}
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
  editing,
  editText,
  setEditText,
  onSaveEdit,
  onCancelEdit,
  onReact,
  onStartEdit,
  onDelete,
}: {
  m: LocalMessage;
  showName: boolean;
  showTime: boolean;
  tight: boolean;
  editing: boolean;
  editText: string;
  setEditText: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onStartEdit: (m: LocalMessage) => void;
  onDelete: (id: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const deleted = !!m.deletedAt;

  if (editing) {
    return (
      <div className="flex justify-end mt-2">
        <div className="flex flex-col items-end w-full max-w-[80%]">
          <textarea
            value={editText}
            autoFocus
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSaveEdit();
              } else if (e.key === "Escape") {
                onCancelEdit();
              }
            }}
            rows={2}
            className="w-full resize-none bg-surface border border-orange rounded-card px-3 py-2 text-sm text-ink-1 focus:outline-none"
          />
          <div className="flex items-center gap-2 mt-1">
            <button type="button" onClick={onCancelEdit} className="text-[11px] font-semibold text-ink-2 hover:text-ink-1">
              Cancel
            </button>
            <button type="button" onClick={onSaveEdit} className="text-[11px] font-semibold text-orange hover:text-orange-dark">
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex ${m.mine ? "justify-end" : "justify-start"} ${tight ? "mt-0.5" : "mt-2"}`}>
      <div className={`flex flex-col max-w-[80%] ${m.mine ? "items-end" : "items-start"}`}>
        {showName && <span className="text-[11px] font-semibold text-ink-3 px-1 mb-0.5">{m.senderName}</span>}

        <div className={`flex items-center gap-1.5 ${m.mine ? "flex-row" : "flex-row-reverse"}`}>
          {/* Hover/tap action cluster (hidden until hover on desktop). */}
          {!deleted && (
            <div className="relative flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => {
                  setPicker((v) => !v);
                  setMenu(false);
                }}
                aria-label="Add reaction"
                className="w-7 h-7 flex items-center justify-center rounded-full text-ink-3 hover:text-ink-1 hover:bg-tile"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9 10h.01M15 10h.01M8.5 14.5a4 4 0 0 0 7 0" />
                </svg>
              </button>
              {m.mine && !m.pending && (
                <button
                  type="button"
                  onClick={() => {
                    setMenu((v) => !v);
                    setPicker(false);
                  }}
                  aria-label="Message actions"
                  className="w-7 h-7 flex items-center justify-center rounded-full text-ink-3 hover:text-ink-1 hover:bg-tile"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <circle cx="5" cy="12" r="1.4" />
                    <circle cx="12" cy="12" r="1.4" />
                    <circle cx="19" cy="12" r="1.4" />
                  </svg>
                </button>
              )}

              {picker && (
                <div className={`absolute bottom-9 ${m.mine ? "right-0" : "left-0"} z-10 flex items-center gap-0.5 bg-surface border border-hairline rounded-full shadow-tile px-1.5 py-1`}>
                  {QUICK_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        onReact(m.id, e);
                        setPicker(false);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-tile text-base leading-none"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {menu && m.mine && (
                <div className={`absolute bottom-9 ${m.mine ? "right-0" : "left-0"} z-10 w-32 bg-surface border border-hairline rounded-card shadow-tile py-1 text-sm`}>
                  <button
                    type="button"
                    onClick={() => {
                      onStartEdit(m);
                      setMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-ink-1 hover:bg-tile"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(m.id);
                      setMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-status-critical-text hover:bg-status-critical-bg/60"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}

          {/* The bubble */}
          {deleted ? (
            <div className="px-3.5 py-2 text-sm italic text-ink-3 rounded-card border border-dashed border-hairline">
              Message deleted
            </div>
          ) : (
            <div
              className={`px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words rounded-card ${
                m.mine ? `bg-orange text-white ${m.pending ? "opacity-60" : ""}` : "bg-surface text-ink-1 border border-hairline"
              }`}
            >
              {m.body}
            </div>
          )}
        </div>

        {/* Reaction chips */}
        {!deleted && m.reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${m.mine ? "justify-end" : "justify-start"}`}>
            {m.reactions.map((r) => (
              <ReactionChip key={r.emoji} r={r} onClick={() => onReact(m.id, r.emoji)} />
            ))}
          </div>
        )}

        {showTime && (
          <span className="text-[10px] text-ink-3 px-1 mt-0.5">
            {m.pending ? "Sending…" : shortTime(m.createdAt)}
            {m.editedAt && !deleted ? " · edited" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function ReactionChip({ r, onClick }: { r: MessageReaction; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={r.names.join(", ")}
      className={`inline-flex items-center gap-1 px-1.5 h-6 rounded-full border text-xs leading-none transition-colors ${
        r.mine
          ? "bg-orange-light border-orange/40 text-orange-dark"
          : "bg-tile border-hairline text-ink-2 hover:bg-[#EFE6D4]"
      }`}
    >
      <span className="text-[13px]">{r.emoji}</span>
      <span className="font-semibold tabular-nums">{r.count}</span>
    </button>
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
