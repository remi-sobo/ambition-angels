import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Ambition Coach is AA-only: every route here renders only when the org
// holds `aa.coach` (seeded for Ambition Angels alone). Other tenants get the
// not-enabled panel on a direct hit; the nav tab is hidden for them too.
export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="aa.coach" label="Ambition Coach">
      {children}
    </FeatureGate>
  );
}
