import type { Metadata } from "next";
import StrategyRoom from "./StrategyRoom";

// Internal reference page. Gated at the edge (see middleware.ts) and kept out
// of search indexes belt-and-suspenders, even though crawlers never get past
// the gate. It is intentionally absent from the public <Nav>.
export const metadata: Metadata = {
  title: "Strategy Room",
  robots: { index: false, follow: false, nocache: true },
};

export default function StrategyPage() {
  return <StrategyRoom />;
}
