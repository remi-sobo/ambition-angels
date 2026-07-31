import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Section layout for /admin/fundraising/*. The sidebar keeps only the daily
// surfaces (Today's Moves · Donors · Pipeline · Grants · Campaigns); the
// full set — including Prospects, the Ask Log, and fundraising Strategy —
// rides on the section sub-nav declared in lib/admin/nav.ts and rendered from
// the admin layout. Volunteers routes live under this group too but are
// IA-homed in Program, so they get Program's bar instead (their longer route
// prefix wins the match).
// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.fundraising` entitlement; otherwise the
// not-authorized panel. Direct URL hits are covered here.
export default function FundraisingLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.fundraising" label="Fundraising">
      {children}
    </FeatureGate>
  );
}
