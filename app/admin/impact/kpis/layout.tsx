import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// B2 host (Spec B, lib/admin/v2routes.ts): /admin/kpis 308s here; this V2 seat
// renders the V1 page until its destination cuts over (B3+). The gate
// mirrors the V1 section layout, so a direct hit behaves identically —
// unentitled orgs get the permission-limited panel, never a 404.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.metrics" label="Metrics">
      {children}
    </FeatureGate>
  );
}
