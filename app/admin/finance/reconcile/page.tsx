import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import ReconcileInbox, { type ReconItem } from "./_components/ReconcileInbox";
import PageHeader from "../../_components/PageHeader";

// Reconcile tab — the Cowork reconciliation inbox. The weekly sweep (HubSpot +
// Gmail) drops proposed ledger entries here; Shannon works the queue so the
// week starts with coherent numbers. Nothing hits the ledger until accepted.
export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  const supabase = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS, so both reads are scoped
  // to the active org. No session → empty inbox.
  const ctx = await getOrgContext();
  if (!ctx) {
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

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Reconcile"
        subtitle={
          <span className="block max-w-2xl">
            Cowork sweeps the week&apos;s HubSpot deals and email commitments and proposes ledger
            entries here. Accept what&apos;s real and the numbers update everywhere — nothing touches
            the books until you say so. Work this to zero on Friday and Monday starts clean.
          </span>
        }
      />
      <ReconcileInbox pending={pending} resolved={resolved} />
    </div>
  );
}
