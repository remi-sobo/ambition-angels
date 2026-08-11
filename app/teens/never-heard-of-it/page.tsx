import type { Metadata } from "next";
import NeverHeardGame from "./NeverHeardGame";

// Never Heard of It (specs/teen-games-v1.md Phase 4): one mystery career
// a day, eight clues to name it. Indexable like the other live games —
// the share block deep-links here.
export const metadata: Metadata = {
  title: "Never Heard of It · Ambition Angels",
  description:
    "One mystery career a day. Eight clues to name it. Same job for everyone, everywhere.",
};

export default function NeverHeardOfItPage() {
  return <NeverHeardGame />;
}
