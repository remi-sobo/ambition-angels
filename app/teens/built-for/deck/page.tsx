import type { Metadata } from "next";
import DeckCodeEntry from "./DeckCodeEntry";

// Come-back door (Phase 4 definition of done): a week later, a different
// device, only the six characters — and the deck is there.
export const metadata: Metadata = {
  title: "Find Your Deck · What Are You Built For",
  robots: { index: false, follow: false },
};

export default function DeckEntryPage() {
  return <DeckCodeEntry />;
}
