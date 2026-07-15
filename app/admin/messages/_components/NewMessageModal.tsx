"use client";

import { useState } from "react";
import Button from "../../_components/Button";
import { Avatar } from "./Avatar";
import { TYPE } from "@/lib/admin/typeScale";

type Person = { userId: string; name: string };

/**
 * Start a conversation. Pick one person for a DM, or several for a group (the
 * optional title appears once more than one is selected). On create it resolves
 * the thread server-side (DMs dedupe) and the parent navigates to it.
 */
export default function NewMessageModal({
  people,
  onClose,
  onCreated,
}: {
  people: Person[];
  onClose: () => void;
  onCreated: (threadId: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isGroup = selected.size > 1;

  async function start() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientIds: Array.from(selected),
          title: isGroup ? title.trim() || null : null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.threadId) {
        setError(j.error ?? "Couldn't start the conversation.");
        setBusy(false);
        return;
      }
      onCreated(j.threadId as string);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New message"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div className="relative w-full sm:max-w-md bg-surface rounded-t-card-lg sm:rounded-card-lg border border-hairline shadow-tile max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="font-heading font-bold text-lg text-ink-1">New message</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-1 transition-colors w-8 h-8 -mr-1.5 flex items-center justify-center rounded-full hover:bg-tile"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 overflow-y-auto">
          <div className={`${TYPE.cardLabel} mb-2`}>
            To
          </div>
          {people.length === 0 ? (
            <p className="text-sm text-ink-2 py-4">
              No teammates to message yet. Members appear here once they&apos;ve set a
              display name.
            </p>
          ) : (
            <ul className="space-y-1">
              {people.map((p) => {
                const on = selected.has(p.userId);
                return (
                  <li key={p.userId}>
                    <button
                      type="button"
                      onClick={() => toggle(p.userId)}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-card text-left transition-colors ${
                        on ? "bg-orange-light" : "hover:bg-tile"
                      }`}
                    >
                      <Avatar name={p.name} id={p.userId} size={34} />
                      <span className="flex-1 text-sm font-medium text-ink-1 truncate">
                        {p.name}
                      </span>
                      <span
                        className={`shrink-0 w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center ${
                          on ? "bg-orange border-orange text-white" : "border-gray-mid"
                        }`}
                      >
                        {on && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12.5l4 4 10-10" />
                          </svg>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {isGroup && (
            <div className="mt-4">
              <div className={`${TYPE.cardLabel} mb-2`}>
                Group name <span className="text-ink-3/70 normal-case tracking-normal">(optional)</span>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Demo Day crew"
                maxLength={80}
                className="w-full bg-tile border border-outline rounded-card px-3 py-2 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange"
              />
            </div>
          )}

          {error && <p className="mt-3 text-sm text-status-critical-text">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-hairline flex items-center justify-between gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span className="text-xs text-ink-3">
            {selected.size === 0
              ? "Pick a teammate"
              : isGroup
                ? `${selected.size} people · group`
                : "Direct message"}
          </span>
          <Button onClick={start} disabled={selected.size === 0 || busy}>
            {busy ? "Starting…" : "Start"}
          </Button>
        </div>
      </div>
    </div>
  );
}
