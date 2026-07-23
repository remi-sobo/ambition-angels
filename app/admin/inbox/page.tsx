import Link from "next/link";
import PageHeader from "../_components/PageHeader";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import InboxList, { type InboxItem } from "./InboxList";
import { TYPE } from "@/lib/admin/typeScale";

// Per-user notification inbox. RLS scopes every read to the current user
// (recipient_id = auth.uid() AND notifications.read), so the query carries no
// recipient filter — the feed index (recipient_id, created_at desc) serves
// the newest-first order.
//
// Inbox vs Messages (both live under Command Center, intentionally separate):
// Inbox is the read-once notification feed — alerts, mentions, and system
// events from anywhere in BloomOS. Messages (/admin/messages) is the team
// chat itself. A new chat message also drops ONE unread pointer here per
// conversation (see postMessage in lib/messaging/threads.ts), so a message
// can legitimately appear in both places until it's read.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

// Tiny Phase-2 resolver. Real linked entities arrive with the Phase-3
// emitter; keep this small and additive.
const LINK_MAP: Record<string, (id: string) => string> = {
  constituent: (id) => `/admin/fundraising/donors/${id}`,
  fr_prospects: (id) => `/admin/fundraising/prospects/${id}`,
};

type Row = {
  id: string;
  title: string;
  body: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

function resolveHref(n: Row): string | null {
  if (n.url) return n.url;
  if (n.linked_entity_type && n.linked_entity_id) {
    const build = LINK_MAP[n.linked_entity_type];
    return build ? build(n.linked_entity_id) : null;
  }
  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[900px] px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader
          title="Inbox"
          subtitle={
            <>
              Alerts, mentions, and updates for you from across BloomOS. New team
              messages ping here too — open one to reply in{" "}
              <Link href="/admin/messages" className="text-orange hover:underline">
                Messages
              </Link>
              .
            </>
          }
        />
        {children}
      </div>
    </div>
  );
}

export default async function InboxPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <Shell>
        <p className={`${TYPE.bodyMuted}`}>Sign in to see your notifications.</p>
      </Shell>
    );
  }

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("notifications")
    .select("id, title, body, linked_entity_type, linked_entity_id, url, read_at, created_at")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    return (
      <Shell>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The notifications table isn&apos;t in this database yet. Apply{" "}
          <code className="text-orange">notifications_spine.sql</code>, then reload.
        </div>
      </Shell>
    );
  }

  const items: InboxItem[] = (data ?? []).map((n) => {
    const row = n as Row;
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
      read: row.read_at !== null,
      href: resolveHref(row),
    };
  });

  return (
    <Shell>
      <InboxList items={items} />
    </Shell>
  );
}
