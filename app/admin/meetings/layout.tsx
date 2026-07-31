import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Section layout for /admin/meetings/*. The whole meetings product is one
// Operations sidebar item; its Overview / Connections / Booking page tabs are
// declared on that item in lib/admin/nav.ts and rendered from the admin
// layout's section sub-nav, below the Operations row.
// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.meetings` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
export default function MeetingsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.meetings" label="Meetings">
      {children}
    </FeatureGate>
  );
}
