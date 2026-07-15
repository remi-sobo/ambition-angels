import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Module gate (core fence B1): every route under this group renders only when
// the org holds the `ai.prospect_research` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
export default function ProspectsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="ai.prospect_research" label="Prospect Research">
      {children}
    </FeatureGate>
  );
}
