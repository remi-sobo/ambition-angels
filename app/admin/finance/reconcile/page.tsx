import ReconcileSection from "./ReconcileSection";

// The V1 reconcile route. The whole inbox lives in ReconcileSection
// (extracted at Spec Finance N1) so Finance → Transactions embeds the same
// queue; here it renders standalone — output byte-identical to the pre-N1
// page. At the N4 cutover this route 308s to /admin/finance/transactions.
export const dynamic = "force-dynamic";

export default async function ReconcilePage() {
  return <ReconcileSection />;
}
