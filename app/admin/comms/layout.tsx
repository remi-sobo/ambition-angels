import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Module gate (core fence B1): every route under /admin/comms renders only
// when the org holds `modules.comms`; otherwise the not-authorized panel.
// Direct URL hits are covered here — sidebar hiding alone is cosmetic.
//
// The second gate — comms.manage — is per-page, because it is a PERMISSION,
// not an entitlement: an org can hold the module while a given member (a
// board viewer, someone in finance) holds no comms key.
export default function CommsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.comms" label="Comms">
      {children}
    </FeatureGate>
  );
}
