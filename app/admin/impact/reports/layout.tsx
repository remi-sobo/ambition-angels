import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Spec Impact I2: the Reports seat (a V2-only screen — its own path IS the
// seat). Gated like the rest of the metrics section, so a direct hit behaves
// identically for unentitled orgs.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.metrics" label="Metrics">
      {children}
    </FeatureGate>
  );
}
