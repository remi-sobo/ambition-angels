import type { ReactNode } from "react";
import AaOnlyGate from "@/app/admin/_components/AaOnlyGate";

// AA-only gate (pre-SafeSpace fence): the career library and teen-games
// admin read and write GLOBAL tables (ms_*, game_*) that feed Ambition
// Angels' public teen games, so they require the AA-only aa.career_library
// entitlement — not modules.content, a generic module another tenant may
// hold. The sidebar row still keys on modules.content (lib/admin/nav.ts).
export default function CareersLayout({ children }: { children: ReactNode }) {
  return (
    <AaOnlyGate feature="aa.career_library" label="Career Library">
      {children}
    </AaOnlyGate>
  );
}
