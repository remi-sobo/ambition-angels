import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";

// Spec Inbox X1: the Messages seat. The gate mirrors the V1 messages layout,
// so a direct hit behaves identically — unentitled orgs get the
// permission-limited panel, never a 404.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.messages" label="Messages">
      {children}
    </FeatureGate>
  );
}
