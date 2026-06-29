"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type InboxItem = {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  read: boolean;
  /** Resolved click-through, or null when the row has no destination. */
  href: string | null;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Tell the sidebar badge to re-fetch immediately after a read change, rather
// than waiting up to one poll cycle.
const pingBadge = () => window.dispatchEvent(new Event("bloomos:notifications-changed"));

export default function InboxList({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unreadCount = items.filter((i) => !i.read).length;

  async function open(item: InboxItem) {
    if (!item.read) {
      try {
        await fetch(`/api/admin/notifications/${item.id}/read`, { method: "POST" });
      } catch {
        // Best effort — navigation still proceeds; the poll will reconcile.
      }
      pingBadge();
    }
    if (item.href) router.push(item.href);
    else router.refresh();
  }

  async function markAll() {
    setBusy(true);
    try {
      await fetch("/api/admin/notifications/read-all", { method: "POST" });
    } catch {
      // ignore — next poll reconciles
    }
    pingBadge();
    router.refresh();
    setBusy(false);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm text-ink-2">
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </div>
        <button
          type="button"
          onClick={markAll}
          disabled={unreadCount === 0 || busy}
          className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mark all read
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-surface border border-hairline rounded-card-lg p-8 text-center text-sm text-ink-2">
          No notifications yet. When research finishes, a task is assigned, or
          someone mentions you, it shows up here.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const inner = (
              <>
                <span
                  className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${item.read ? "bg-transparent" : "bg-orange"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${item.read ? "text-ink-2" : "font-semibold text-ink-1"}`}>
                    {item.title}
                  </span>
                  {item.body && (
                    <span className="block text-sm text-ink-2 mt-0.5 line-clamp-2">{item.body}</span>
                  )}
                  <span className="block text-[11px] uppercase tracking-wide text-ink-3 mt-1">
                    {timeAgo(item.createdAt)}
                  </span>
                </span>
              </>
            );

            const base = "w-full text-left flex gap-3 items-start rounded-card-lg border px-4 py-3 transition-colors";
            const tone = item.read
              ? "bg-app/40 border-hairline"
              : "bg-surface border-outline shadow-tile";

            return (
              <li key={item.id}>
                {item.href ? (
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className={`${base} ${tone} hover:bg-[#EFE6D4]`}
                  >
                    {inner}
                  </button>
                ) : (
                  // No destination → non-clickable, per spec.
                  <div className={`${base} ${tone}`}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
