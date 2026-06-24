import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ReconcileInbox, { type ReconItem } from "./_components/ReconcileInbox";

// Reconcile tab — the Cowork reconciliation inbox. The weekly sweep (HubSpot +
// Gmail) drops proposed ledger entries here; Shannon works the queue so the
// week starts with coherent numbers. Nothing hits the ledger until accepted.
export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  const supabase = getSupabaseAdmin();
  const [pendingRes, resolvedRes] = await Promise.all([
    supabase
      .from("fin_reconciliation_items")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("fin_reconciliation_items")
      .select("*")
      .neq("status", "pending")
      .order("resolved_at", { ascending: false })
      .limit(8),
  ]);
  const pending = (pendingRes.data ?? []) as ReconItem[];
  const resolved = (resolvedRes.data ?? []) as ReconItem[];

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8">
      <div className="mb-5">
        <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
          Reconcile
        </h1>
        <p className="mt-2 text-sm text-ink-2 max-w-2xl">
          Cowork sweeps the week&apos;s HubSpot deals and email commitments and proposes ledger
          entries here. Accept what&apos;s real and the numbers update everywhere — nothing touches
          the books until you say so. Work this to zero on Friday and Monday starts clean.
        </p>
      </div>
      <ReconcileInbox pending={pending} resolved={resolved} />
    </div>
  );
}
