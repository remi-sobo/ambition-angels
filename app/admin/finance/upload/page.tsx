import Link from "next/link";
import PageHeader from "../../_components/PageHeader";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import ReconcileCard from "../_components/ReconcileCard";
import UploadClient from "./_components/UploadClient";

// The Import hub — the one place to bring everything in: bank transactions,
// the budget, and pledges — plus "set current balance" so the cash figure stays
// reconciled to the real bank.
export const dynamic = "force-dynamic";

export default async function FinanceUploadPage() {
  const snap = await getFinanceSnapshot();

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <PageHeader
        eyebrow="Import hub"
        title="Upload"
        subtitle="Bring everything in here — bank transactions, budget, and pledges — then set your current balance so cash matches the bank."
      />

      {/* Set current balance / reconcile */}
      <ReconcileCard computedCash={snap.cashOnHand} anchorDate={snap.cfg.startDate} reconciledAt={snap.cfg.reconciledAt} />

      {/* Other import flows */}
      <section className="grid sm:grid-cols-2 gap-3">
        <HubLink
          href="/admin/finance/budget/import"
          title="Import budget →"
          desc="Bring in your annual budget from a QuickBooks export."
        />
        <HubLink
          href="/admin/finance/revenue"
          title="Pledges & grants →"
          desc="Log committed, projected, and received revenue (or sync from HubSpot)."
        />
      </section>

      <UploadClient />
    </div>
  );
}

function HubLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-4 hover:border-orange/40 transition-colors"
    >
      <div className="text-sm font-semibold text-ink-1">{title}</div>
      <div className="text-xs text-ink-2 mt-0.5">{desc}</div>
    </Link>
  );
}
