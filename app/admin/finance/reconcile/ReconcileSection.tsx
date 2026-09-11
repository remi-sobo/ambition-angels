import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import ReconcileInbox, { type ReconItem } from "./_components/ReconcileInbox";
import PageHeader from "../../_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";

// Reconcile — the Cowork reconciliation inbox. The weekly sweep (HubSpot +
// Gmail) drops proposed ledger entries here; Shannon works the queue so the
// week starts with coherent numbers. Nothing hits the ledger until accepted.
//
// Extracted at Spec Finance N1: the V1 route renders it standalone
// (embedded=false — output byte-identical to the pre-N1 page) and
// Finance → Transactions embeds it as its reconcile section — the same
// inbox, one write path. At the N4 cutover the standalone route 308s to
// Transactions.

export default async function ReconcileSection({ embedded = false }: { embedded?: boolean }) {
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS, so both reads are scoped
  // to the active org. No session → empty inbox.
  const ctx = await getOrgContext();
  if (!ctx) {
    if (embedded) return null;
    return (
      <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Reconcile" subtitle="Sign in to view the reconciliation inbox." />
      </div>
    );
  }
  const orgId = ctx.orgId;
  const [pendingRes, resolvedRes] = await Promise.all([
    supabase
      .from("fin_reconciliation_items")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("fin_reconciliation_items")
      .select("*")
      .eq("org_id", orgId)
      .neq("status", "pending")
      .order("resolved_at", { ascending: false })
      .limit(8),
  ]);
  const pending = (pendingRes.data ?? []) as ReconItem[];
  const resolved = (resolvedRes.data ?? []) as ReconItem[];

  if (embedded) {
    return (
      <section className="mt-8">
        <div className="mb-3">
          <h2 className={TYPE.cardTitle}>
            Reconcile <span className="text-ink-3 font-normal">· {pending.length} pending</span>
          </h2>
          <p className="text-[11px] text-ink-3 max-w-2xl">
            Cowork&apos;s proposed ledger entries from the week&apos;s HubSpot deals and email
            commitments. Nothing touches the books until accepted; the close below blocks while
            any are pending.
          </p>
        </div>
        <ReconcileInbox pending={pending} resolved={resolved} />
      </section>
    );
  }

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Reconcile"
        subtitle={
          <span className="block max-w-2xl">
            Cowork sweeps the week&apos;s HubSpot deals and email commitments and proposes ledger
            entries here. Accept what&apos;s real and the numbers update everywhere. Nothing touches
            the books until you say so. Work this to zero on Friday and Monday starts clean.
          </span>
        }
      />
      <ReconcileInbox pending={pending} resolved={resolved} />
    </div>
  );
}
