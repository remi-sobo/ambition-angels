"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

/**
 * App-wide unread badges (Inbox + Messages) for the admin chrome. Mounted once
 * at the layout so the Sidebar and the mobile dock share a single source —
 * one poll, one Realtime channel, not one per consumer.
 *
 * Counts update three ways: a 50s poll (fallback), the same-tab "changed"
 * events surfaces dispatch after marking read, and — the instant part — a
 * Realtime channel that refetches the moment a message or notification row
 * lands (RLS only delivers rows addressed to this user). So a teammate's
 * message lights the badge immediately, on whatever page you're on.
 */

type Badges = { messages: number; notifications: number };

const BadgesContext = createContext<Badges>({ messages: 0, notifications: 0 });

export function useAdminBadges(): Badges {
  return useContext(BadgesContext);
}

export function AdminBadgesProvider({
  orgId,
  enabled,
  children,
}: {
  orgId: string | null;
  enabled: boolean;
  children: ReactNode;
}) {
  const [badges, setBadges] = useState<Badges>({ messages: 0, notifications: 0 });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    const loadMessages = async () => {
      try {
        const r = await fetch("/api/admin/messages/unread-count", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setBadges((b) => ({ ...b, messages: typeof j.count === "number" ? j.count : 0 }));
      } catch {
        // keep last count; next poll recovers
      }
    };
    const loadNotifications = async () => {
      try {
        const r = await fetch("/api/admin/notifications/unread-count", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive)
          setBadges((b) => ({ ...b, notifications: typeof j.count === "number" ? j.count : 0 }));
      } catch {
        // keep last count; next poll recovers
      }
    };

    loadMessages();
    loadNotifications();
    const id = setInterval(() => {
      loadMessages();
      loadNotifications();
    }, 50000);
    window.addEventListener("bloomos:messages-changed", loadMessages);
    window.addEventListener("bloomos:notifications-changed", loadNotifications);

    let channel: ReturnType<ReturnType<typeof getSupabaseBrowser>["channel"]> | null = null;
    if (orgId) {
      const supabase = getSupabaseBrowser();
      channel = supabase
        .channel(`admin-badges:${orgId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
          () => loadMessages()
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `org_id=eq.${orgId}` },
          () => loadNotifications()
        )
        .subscribe();
    }

    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("bloomos:messages-changed", loadMessages);
      window.removeEventListener("bloomos:notifications-changed", loadNotifications);
      if (channel) getSupabaseBrowser().removeChannel(channel);
    };
  }, [orgId, enabled]);

  return <BadgesContext.Provider value={badges}>{children}</BadgesContext.Provider>;
}
