import PageHeader from "../../_components/PageHeader";
import PageShell from "../../_components/ui/PageShell";
import ListRow, { ListRows } from "../../_components/ui/ListRow";
import Button from "../../_components/ui/Button";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import ReconcileCard from "../_components/ReconcileCard";
import UploadClient from "./_components/UploadClient";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// The Import hub — the one place to bring everything in: bank transactions,
// the budget, and pledges — plus "set current balance" so the cash figure stays
// reconciled to the real bank.
export const dynamic = "force-dynamic";

export default async function FinanceUploadPage() {
  const roleGate = await requirePagePermission("finance.read", "Finance");
  if (!roleGate.ok) return roleGate.page;
  const snap = await getFinanceSnapshot();

  // Settings archetype (V4 Stage G2): reading width, one section per job.
  return (
    <PageShell width="reading">
      <PageHeader
        breadcrumb={[{ label: "Settings", href: "/admin/settings" }, { label: "Finance", href: "/admin/settings/finance" }]}
        title="Upload"
        subtitle="Bring in bank transactions, the budget and pledges, then set your current balance so cash matches the bank."
      />

      <div className="space-y-6">
        <ReconcileCard computedCash={snap.cashOnHand} anchorDate={snap.cfg.startDate} reconciledAt={snap.cfg.reconciledAt} />

        <UploadClient />

        <section className="bg-surface border border-hairline rounded-panel px-5">
          <ListRows>
            <ListRow
              title="Import a budget"
              context="Bring in your annual budget from a QuickBooks export."
              actions={
                <Button variant="secondary" size="sm" href="/admin/settings/finance/budget-import">
                  Import budget
                </Button>
              }
            />
            <ListRow
              title="Pledges and grants"
              context="Log committed, projected and received revenue, or sync from HubSpot."
              actions={
                <Button variant="secondary" size="sm" href="/admin/finance/forecast">
                  Open pledges
                </Button>
              }
            />
          </ListRows>
        </section>
      </div>
    </PageShell>
  );
}
