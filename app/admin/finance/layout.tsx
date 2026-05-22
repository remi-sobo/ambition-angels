import type { ReactNode } from "react";
import SubNav from "./_components/SubNav";

// Section layout for /admin/finance/*. The sub-nav lives here (not on the
// individual pages) so the tabs persist across navigation and the active
// pill is always in sync with the route. Sticky so the tabs stay reachable
// while scrolling long tables (Transactions / Budget) and long dashboards.
export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <div
        className="sticky admin-sticky-top z-30 bg-ink/95 backdrop-blur-sm border-b border-white/5"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.25em] text-orange/80">
            Finance
          </span>
          <SubNav />
        </div>
      </div>
      {children}
    </div>
  );
}
