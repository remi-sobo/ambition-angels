import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Section layout for /admin/finance/*. The sub-nav is declared on the Finance
// item in lib/admin/nav.ts and rendered from the admin layout, so the tabs
// persist across navigation, the active pill is always in sync with the route,
// and they stay reachable (sticky) while scrolling long tables (Transactions /
// Budget) and long dashboards. Finance is a one-item section, so the bar shows
// just this tab row.
// The whole group sits behind the `modules.finance` entitlement (core fence
// B1) — a direct URL hit on a disabled module gets the not-authorized panel.
export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.finance" label="Finance">
      {children}
    </FeatureGate>
  );
}
