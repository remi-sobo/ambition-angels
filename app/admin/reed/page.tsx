import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { hasEntitlement } from "@/lib/admin/entitlements";
import ReedInbox from "./_components/ReedInbox";

export const dynamic = "force-dynamic";

// Reed review inbox (Phase 7, decision layer): the human surface where Reed's
// inert drafts and cross-module suggestions are accepted or dismissed. Nothing
// here sends or executes — approving a draft marks it ready for a human to send.
export default async function ReedPage() {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  if (!(await hasEntitlement("ai.reed"))) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Reed isn&apos;t enabled for this workspace.</div>;
  }

  const supabase = createServerSupabase();
  const [{ data: drafts }, { data: suggestions }] = await Promise.all([
    supabase
      .from("reed_drafts")
      .select("id, kind, title, body, status, created_at")
      .eq("status", "drafted")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("reed_suggestions")
      .select("id, domain, title, rationale, priority, status, created_at")
      .eq("status", "suggested")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return <ReedInbox drafts={drafts ?? []} suggestions={suggestions ?? []} />;
}
