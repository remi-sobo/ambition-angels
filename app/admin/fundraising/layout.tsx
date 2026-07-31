import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";
import SectionSubNav from "@/app/admin/_components/SectionSubNav";

// Section layout for /admin/fundraising/*. The sidebar keeps only the daily
// surfaces (Today's Moves · Donors · Pipeline · Grants · Campaigns); the
// full set — including Prospects, the Ask Log, and fundraising Strategy —
// persists here as tabs, Finance-style. Volunteers routes live under this
// group too but are IA-homed in Program, so they're not a tab and the bar
// itself stays off those routes (`exclude`).
// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.fundraising` entitlement; otherwise the
// not-authorized panel. Direct URL hits are covered here.
export default function FundraisingLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.fundraising" label="Fundraising">
      <div>
        <SectionSubNav
          eyebrow="Fundraising"
          rootHref="/admin/fundraising"
          exclude={["/admin/fundraising/volunteers"]}
          tabs={[
            { href: "/admin/fundraising/today", label: "Today's Moves" },
            { href: "/admin/fundraising/donors", label: "Donors" },
            { href: "/admin/fundraising", label: "Pipeline" },
            { href: "/admin/fundraising/prospects", label: "Prospects" },
            { href: "/admin/fundraising/asks", label: "Ask Log" },
            { href: "/admin/fundraising/grants", label: "Grants" },
            { href: "/admin/fundraising/campaigns", label: "Campaigns" },
            { href: "/admin/fundraising/strategy", label: "Strategy" },
          ]}
        />
        {children}
      </div>
    </FeatureGate>
  );
}
