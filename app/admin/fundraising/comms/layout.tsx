import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Comms renders only for orgs holding modules.comms (the nav tab uses the
// same key), so a direct URL hit from an org without it gets the
// not-authorized panel rather than the page.
export default function CommsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.comms" label="Comms">
      {children}
    </FeatureGate>
  );
}
