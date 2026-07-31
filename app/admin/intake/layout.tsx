import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Intake is a tab of Students in the IA even though its routes live at
// /admin/intake — the Students item in lib/admin/nav.ts claims this prefix, so
// the section sub-nav keeps showing the Program row and the Roster/Intake tabs.
// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.program` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
export default function IntakeLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.program" label="Program">
      {children}
    </FeatureGate>
  );
}
