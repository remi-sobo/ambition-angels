import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Module gate (core fence B1): the import wizard writes participants, so it
// rides the program module's entitlement exactly like /admin/students. E4
// (constituent imports) revisits this — a fundraising-only org will need the
// door too, so the gate widens to either-module then.
export default function ImportsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.program" label="Program">
      {children}
    </FeatureGate>
  );
}
