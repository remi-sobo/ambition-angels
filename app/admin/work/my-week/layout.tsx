import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Spec Work W2: My Week is the week grid now, and the grid pairs with the
// Google calendar connection under the meetings module — so the gate follows
// the model's tab feature (lib/admin/nav.ts: my-week ← modules.meetings),
// not the ops gate the B2 host mirrored while it re-exported the doors page.
// The two 9-key orgs lose the tab AND the direct hit together, deliberately.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.meetings" label="Meetings">
      {children}
    </FeatureGate>
  );
}
