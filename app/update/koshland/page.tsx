import type { Metadata } from "next";
import Deck from "./Deck";

export const metadata: Metadata = {
  title: "For Jim Koshland",
  description:
    "A private conversation. Three years in, what you built, what comes next.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

// Direct URL only. Not linked in nav. Not in sitemap.
export default function KoshlandPage() {
  return <Deck />;
}
