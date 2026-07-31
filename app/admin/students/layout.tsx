import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.program` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
// The Roster / Intake tabs come from the Students item in lib/admin/nav.ts,
// rendered by the admin layout's section sub-nav under the Program row.
export default function StudentsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.program" label="Program">
      {children}
    </FeatureGate>
  );
}
