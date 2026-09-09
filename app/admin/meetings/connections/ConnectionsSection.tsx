import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { SCHEDULING_LABEL, type OpsTask } from "@/app/admin/ops/_types/ops";
import { constituentName } from "@/lib/fundraising/display";
import PageHeader from "@/app/admin/_components/PageHeader";
import CandidatesQueue, { type Candidate } from "./CandidatesQueue";
import NewConnectionForm from "./NewConnectionForm";
import ConnectionsBacklog from "./ConnectionsBacklog";
import { TYPE } from "@/lib/admin/typeScale";

// The "get a meeting on the books" pipeline: email-detected intro candidates
// (suggest-then-confirm), the manual "+ new connection" entry point, and the
// backlog of scheduling tasks until each one is booked.
//
// Extracted at Spec Work W3 (decision 3, resolved: the candidates' home is
// Work → Meetings, per the R2 addendum binding connection_candidates there).
// The V1 route (/admin/meetings/connections) renders it standalone — output
// byte-identical to the pre-W3 page — and Work → Meetings embeds the same
// pipeline under its upcoming/past lists. One queue, one write path; the
// candidates stay OUT of v_obligations (Spec A's Contract 3 ruling — they
// already promote into tasks). At the W4 cutover the standalone route 308s
// to /admin/work/meetings.
async function fetchConnections(orgId: string) {
  const supabase = getSupabaseAdmin();

  // Org fence: the service-role client bypasses RLS, so every read is scoped
  // to the active org (ops_tasks and connection_candidates carry org_id).
  const [connectionsRes, candidatesRes] = await Promise.all([
    // The connection backlog: the org's scheduling tasks, in display_order
    // (nulls last), oldest first as a stable tiebreak. Org-wide (not filtered
    // to one hardcoded scheduler) so every tenant's backlog just works.
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("org_id", orgId)
      .contains("labels", [SCHEDULING_LABEL])
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    // Pending email-detected candidates, newest first, with the reconciled
    // person for the card label.
    supabase
      .from("connection_candidates")
      .select(
        "id, thread_id, subject, constituent_id, " +
          "constituent:constituent_id(type, first_name, last_name, org_name)"
      )
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const candidates: Candidate[] = (
    (candidatesRes.data ?? []) as unknown as Array<{
      id: string;
      thread_id: string;
      subject: string | null;
      constituent_id: string;
      constituent: {
        type: string;
        first_name: string | null;
        last_name: string | null;
        org_name: string | null;
      } | null;
    }>
  ).map((c) => ({
    id: c.id,
    threadId: c.thread_id,
    subject: c.subject,
    constituentId: c.constituent_id,
    personName: c.constituent ? constituentName(c.constituent) : "Unknown contact",
  }));

  return {
    connections: (connectionsRes.data ?? []) as OpsTask[],
    candidates,
  };
}

export default async function ConnectionsSection({ embedded = false }: { embedded?: boolean }) {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const { connections, candidates } = await fetchConnections(ctx.orgId);

  if (embedded) {
    return (
      <section className="max-w-5xl px-4 lg:px-8 pb-6 lg:pb-8 space-y-6">
        <div>
          <h2 className={TYPE.cardTitle}>
            Connections{" "}
            <span className="text-ink-3 font-normal">
              · {connections.length + candidates.length} open
            </span>
          </h2>
          <p className="text-[11px] text-ink-3 max-w-2xl">
            People you owe a meeting — from email intros or added by hand — tracked until each
            one is booked.
          </p>
        </div>
        <CandidatesQueue candidates={candidates} />
        <NewConnectionForm />
        <ConnectionsBacklog connections={connections} />
      </section>
    );
  }

  return (
    <div className="max-w-5xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <PageHeader
        title="Connections"
        subtitle="People you owe a meeting — from email intros or added by hand — tracked until each one is booked."
      />
      <CandidatesQueue candidates={candidates} />
      <NewConnectionForm />
      <ConnectionsBacklog connections={connections} />
    </div>
  );
}
