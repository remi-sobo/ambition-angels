import type { ReactNode } from "react";
import AaOnlyGate from "@/app/admin/_components/AaOnlyGate";

// AA-only gate: Import from HubSpot reads the HubSpot mirror through the
// hubspot_bench_candidates* RPCs, which take no org parameter and so return
// AA's contacts to whoever calls them. Until they are org-scoped, the page
// (and /api/admin/fundraising/prospects/hubspot-search) is aa.hubspot_mirror only.
export default function ImportFromHubspotLayout({ children }: { children: ReactNode }) {
  return (
    <AaOnlyGate feature="aa.hubspot_mirror" label="Import from HubSpot">
      {children}
    </AaOnlyGate>
  );
}
