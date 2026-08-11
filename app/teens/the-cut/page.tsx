import type { Metadata } from "next";
import CutLanding from "./CutLanding";

// The Cut landing (specs/teen-games-v1.md Phase 5). Live on the hub since
// the full room flow — host + phones + quorum + solo — passed an
// end-to-end run against real pool data (Remi's call, 2026-08-11).
// Room and projector screens stay noindex permanently.
export const metadata: Metadata = {
  title: "The Cut · Ambition Angels",
  description:
    "Six careers on the board. One rule at a time. The class votes on who gets cut.",
};

export default function TheCutPage() {
  return <CutLanding />;
}
