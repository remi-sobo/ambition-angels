import type { Metadata } from "next";
import CutLanding from "./CutLanding";

// The Cut landing (specs/teen-games-v1.md Phase 5). Launching to
// facilitators first: reachable by link, noindex, and not yet linked from
// the hub — the hub card flips when facilitator runs have proven the
// room flow. Room and projector screens stay noindex permanently.
export const metadata: Metadata = {
  title: "The Cut — Ambition Angels",
  description:
    "Six careers on the board. One rule at a time. The class votes on who gets cut.",
  robots: { index: false, follow: false },
};

export default function TheCutPage() {
  return <CutLanding />;
}
