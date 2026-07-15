import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";
import SectionNav from "./_components/SectionNav";

// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.strategy` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
// SectionNav gives every sub-page the same chip menu + back link (it hides
// itself on the landing page, which carries the menu in its own header).
export default function StrategicPlanLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.strategy" label="Strategy">
      <SectionNav />
      {children}
    </FeatureGate>
  );
}
