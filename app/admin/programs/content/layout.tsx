import type { ReactNode } from "react";
import AaOnlyGate from "@/app/admin/_components/AaOnlyGate";

// B2 host (Spec B, lib/admin/v2routes.ts): /admin/careers 308s here; this V2 seat
// renders the V1 page until its destination cuts over (B3+). The gate
// mirrors the V1 section layout (app/admin/careers/layout.tsx), so a direct
// hit behaves identically — AA-only, unentitled orgs get the panel.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AaOnlyGate feature="aa.career_library" label="Career Library">
      {children}
    </AaOnlyGate>
  );
}
