import type { Metadata } from "next";

// The page itself is a client component, so its metadata lives here.
// The nav calls this page "Careers" — the title should match.
export const metadata: Metadata = {
  title: "Careers",
  description:
    "50 careers, each starting with an 8 to 10 minute introship built with people who do the job. 19 go deeper with a full 30-day internship. Free for every student.",
};

export default function CurriculumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
