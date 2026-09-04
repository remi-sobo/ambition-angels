import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.content` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
// B1 moved the NAV gate off aa.quiz onto modules.content (the quiz and the
// career library are different products) and deferred this layout's key "to
// its destination move" — that move is B2's /admin/programs/content host, so
// the two gates align here. AA holds both keys; no visible change.
export default function CareersLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.content" label="Career Library">
      {children}
    </FeatureGate>
  );
}
