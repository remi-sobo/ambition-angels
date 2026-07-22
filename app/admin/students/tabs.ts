import type { SectionTab } from "@/app/admin/_components/SectionSubNav";

// Shared tab set for the Students section. Intake is the pipeline INTO the
// roster, so it lives as a tab of Students even though its routes sit at
// /admin/intake — both layouts render the same bar so the tabs persist as
// you move between them.
export const STUDENT_TABS: SectionTab[] = [
  { href: "/admin/students", label: "Roster" },
  { href: "/admin/intake", label: "Intake" },
];
