import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// V4 Stage A2: the Comms destination (spec §4) renders only for orgs holding modules.comms, the key every Comms tab carries. The gate mirrors the V1 section layout, so a direct
// hit from an org without the module gets the permission panel, never a 404.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature={"modules.comms"} label="Comms">
      {children}
    </FeatureGate>
  );
}
