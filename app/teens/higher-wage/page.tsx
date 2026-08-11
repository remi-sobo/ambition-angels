import type { Metadata } from "next";
import HigherWageGame from "./HigherWageGame";

// Higher Wage (specs/teen-games-v1.md Phase 3): two jobs, tap the one that
// pays more, keep the streak alive. Indexable like the hub (locked
// decision 6) — share cards deep-link here, not to the hub, so a friend
// tapping a share lands in the game they were sent.
export const metadata: Metadata = {
  title: "Higher Wage · Ambition Angels",
  description:
    "Two real jobs. Tap the one that pays more. Real government pay data. How long can you keep the streak alive?",
};

export default function HigherWagePage() {
  return <HigherWageGame />;
}
