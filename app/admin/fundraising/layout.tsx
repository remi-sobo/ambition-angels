import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";
import PermissionGate from "@/app/admin/_components/PermissionGate";

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
      {/* V4 Stage P: and the role must read fundraising. RLS already returns
          no rows to a role without it (a board viewer, finance); this shows
          the not-authorized panel instead of empty screens with write
          buttons. Pages that read through the service role still call
          requirePagePermission themselves (client navigation inside the
          group does not re-run this layout). */}
      <PermissionGate perm="fundraising.read" label="Fundraising">
        {children}
      </PermissionGate>
    </FeatureGate>
  );
}
