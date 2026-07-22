import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";
import SectionSubNav from "@/app/admin/_components/SectionSubNav";

// Section layout for /admin/ops/*. One "Work" sidebar item fans out here:
// My Week (the personal home, incl. the Monday/Friday wizards), the Tasks
// surface, and Projects — all the same ops_tasks product, so one sub-nav.
// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.ops` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.ops" label="Operations">
      <div>
        <SectionSubNav
          eyebrow="Work"
          rootHref="/admin/ops"
          tabs={[
            {
              href: "/admin/ops/my-week",
              label: "My Week",
              match: ["/admin/ops/monday", "/admin/ops/friday"],
            },
            { href: "/admin/ops", label: "Tasks" },
            { href: "/admin/ops/projects", label: "Projects" },
          ]}
        />
        {children}
      </div>
    </FeatureGate>
  );
}
