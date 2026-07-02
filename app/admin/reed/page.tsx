import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasEntitlement } from "@/lib/admin/entitlements";
import ReedInbox from "./_components/ReedInbox";

export const dynamic = "force-dynamic";

// Reed review inbox (Phase 7, decision layer): the human surface where Reed's
// inert drafts and cross-module suggestions are accepted or dismissed. Nothing
// here sends or executes — approving a draft marks it ready for a human to send.
// Also the permanent Q&A record: every ask is already persisted to
// reed_threads / reed_messages by /api/reed/ask; this page replays them so a
// conversation survives closing the drawer.
export default async function ReedPage() {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  if (!(await hasEntitlement("ai.reed"))) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Reed isn&apos;t enabled for this workspace.</div>;
  }

  const supabase = createServerSupabase();
  const [{ data: drafts }, { data: approved }, { data: suggestions }, { data: proposals }, { data: threads }] = await Promise.all([
    supabase
      .from("reed_drafts")
      .select("id, kind, title, body, status, created_at")
      .eq("status", "drafted")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("reed_drafts")
      .select("id, kind, title, body, status, created_at")
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("reed_suggestions")
      .select("id, domain, title, rationale, priority, status, created_at")
      .eq("status", "suggested")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("reed_plan_proposals")
      .select("id, proposed_type, parent_ref, payload, rationale, status, created_at")
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("reed_threads")
      .select("id, title, created_at")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // The turns of the threads above, replayed oldest-first within each thread.
  const threadIds = (threads ?? []).map((t) => (t as { id: string }).id);
  const { data: messages } = threadIds.length
    ? await supabase
        .from("reed_messages")
        .select("id, thread_id, role, content, created_at")
        .in("thread_id", threadIds)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true })
    : { data: [] };

  const byThread = new Map<string, { id: string; role: "user" | "assistant"; content: string }[]>();
  for (const m of messages ?? []) {
    const msg = m as { id: string; thread_id: string; role: "user" | "assistant"; content: string };
    const list = byThread.get(msg.thread_id) ?? [];
    list.push({ id: msg.id, role: msg.role, content: msg.content });
    byThread.set(msg.thread_id, list);
  }
  const history = (threads ?? [])
    .map((t) => {
      const thread = t as { id: string; title: string | null; created_at: string };
      return { ...thread, messages: byThread.get(thread.id) ?? [] };
    })
    .filter((t) => t.messages.length > 0);

  return (
    <ReedInbox
      drafts={drafts ?? []}
      approved={approved ?? []}
      suggestions={suggestions ?? []}
      proposals={proposals ?? []}
      history={history}
    />
  );
}
