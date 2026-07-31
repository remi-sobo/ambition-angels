import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Section layout for /admin/ops/*. One "Work" sidebar item fans out here:
// My Week (the personal home, incl. the Monday/Friday wizards), the Tasks
// surface, and Projects — all the same ops_tasks product, so one tab row.
// Those tabs are declared on the Work item in lib/admin/nav.ts and rendered
// by the admin layout's section sub-nav, under the Operations row.
// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.ops` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.ops" label="Operations">
      {children}
    </FeatureGate>
  );
}
