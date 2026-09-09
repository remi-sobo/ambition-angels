import CloseSection from "./CloseSection";

// The V1 close route. The whole wizard lives in CloseSection (extracted at
// Spec Finance N1) so Finance → Transactions embeds the same gated close;
// here it renders standalone — output byte-identical to the pre-N1 page.
// At the N4 cutover this route 308s to /admin/finance/transactions.
export const dynamic = "force-dynamic";

export default async function FinanceClosePage() {
  return <CloseSection />;
}
