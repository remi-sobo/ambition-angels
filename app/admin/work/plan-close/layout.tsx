import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Spec Work W1: the Plan & Close seat. The gate mirrors the V1 ops section
// layout, so a direct hit behaves identically — unentitled orgs get the
// permission-limited panel, never a 404.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.ops" label="Operations">
      {children}
    </FeatureGate>
  );
}
