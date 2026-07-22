import type { ReactNode } from "react";
import FeatureGate from "@/app/admin/_components/FeatureGate";
import SectionSubNav from "@/app/admin/_components/SectionSubNav";
import { STUDENT_TABS } from "./tabs";

// Module gate (core fence B1): every route under this group renders only when
// the org holds the `modules.program` entitlement; otherwise the not-authorized
// panel. Direct URL hits are covered here — sidebar hiding alone is cosmetic.
export default function StudentsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="modules.program" label="Program">
      <div>
        <SectionSubNav eyebrow="Students" rootHref="/admin/students" tabs={STUDENT_TABS} />
        {children}
      </div>
    </FeatureGate>
  );
}
