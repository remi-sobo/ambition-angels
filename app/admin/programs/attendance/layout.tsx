import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Spec Programs P1: the Attendance seat (a V2-only screen — its own path IS
// the seat, the organization-health precedent). Gated like the rest of the
// program section, so a direct hit behaves identically for unentitled orgs.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.program" label="Program">
      {children}
    </FeatureGate>
  );
}
