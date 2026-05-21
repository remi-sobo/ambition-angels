import Link from "next/link";

// Placeholder until the dashboard ships (step 8 of feat/admin-finance). Lets
// the sidebar Finance link land somewhere useful — at minimum, a path to the
// upload page so real data can start flowing in.
export default function FinancePage() {
  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="mb-8">
        <h1 className="font-display font-black uppercase tracking-tight text-cream text-3xl sm:text-4xl leading-none">
          Finance
        </h1>
        <p className="mt-2 text-sm text-gray-mid">
          Runway, burn, budget vs actual. The full dashboard ships once
          transactions are flowing in — start by uploading a CSV.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/admin/finance/upload"
          className="rounded-card-lg border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04]"
        >
          <div className="text-xs uppercase tracking-wider text-orange mb-2">
            Import
          </div>
          <div className="text-lg font-medium text-cream mb-1">
            Upload bank CSV
          </div>
          <div className="text-sm text-gray-mid">
            Wells Fargo export → previewed → committed. Duplicates skipped
            automatically.
          </div>
        </Link>

        <Link
          href="/admin/finance/transactions"
          className="rounded-card-lg border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04]"
        >
          <div className="text-xs uppercase tracking-wider text-orange mb-2">
            Review
          </div>
          <div className="text-lg font-medium text-cream mb-1">
            Transactions
          </div>
          <div className="text-sm text-gray-mid">
            Browse, filter, categorize. Flag restricted funds. The
            uncategorized count is your daily todo.
          </div>
        </Link>

        <div className="rounded-card-lg border border-white/5 bg-white/[0.01] p-6 opacity-60">
          <div className="text-xs uppercase tracking-wider text-gray-mid mb-2">
            Coming next
          </div>
          <div className="text-lg font-medium text-cream mb-1">
            Budget · Pledges · Dashboard
          </div>
          <div className="text-sm text-gray-mid">
            Budget vs actual · pledge pipeline · runway, burn, functional
            split.
          </div>
        </div>
      </div>
    </div>
  );
}
