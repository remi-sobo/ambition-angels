import type { Metadata } from "next";

// The page itself is a client component, so its metadata lives here.
// The nav calls this page "Careers" — the title should match.
export const metadata: Metadata = {
  title: "Careers",
  description:
    "19 career tracks, 30 days each, all free. Simulated internships with a real employer, real deliverables, and real career skills — in class on the web, everywhere else on the phone.",
};

export default function CurriculumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
