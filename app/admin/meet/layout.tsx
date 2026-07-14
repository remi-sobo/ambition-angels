import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.meetings` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
export default function MeetLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.meetings" label="Meetings">
      {children}
    </FeatureGate>
  );
}
