import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Module gate (core fence B1): the import wizard serves both entity targets —
// participants (program) and constituents (fundraising) — so either module's
// entitlement opens the door. The per-run entity choice is validated
// server-side by the routes; this gate covers direct URL hits.
export default function ImportsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature={["modules.program", "modules.fundraising"]} label="Import">
      {children}
    </FeatureGate>
  );
}
