import type { ReactNode } from "react";
import SectionNav from "@/app/admin/strategic-plan/_components/SectionNav";

// Spec Org O1: the child host keeps the V1 chip bar (the spec's second
// failure mode is the bar dying at the new paths). SectionNav links the V1
// paths — they 308 through once the O2 rows activate — and hides itself on
// both landings. The modules.strategy gate comes from the parent layout.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionNav />
      {children}
    </>
  );
}
