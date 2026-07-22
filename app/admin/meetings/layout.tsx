import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";
import SubNav from "./_components/SubNav";

// Section layout for /admin/meetings/*. The sub-nav lives here (not on the
// individual pages) so the tabs persist across Overview / Connections /
// Bookings / Booking page — the whole meetings product is one sidebar item.
// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.meetings` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
export default function MeetingsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.meetings" label="Meetings">
      <div>
        <div className="sticky admin-sticky-top z-30 bg-ink/95 backdrop-blur-sm border-b border-hairline">
          <div className="max-w-7xl px-4 lg:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.25em] text-orange/80">
              Meetings
            </span>
            <SubNav />
          </div>
        </div>
        {children}
      </div>
    </FeatureGate>
  );
}
