import type { Metadata } from "next";
import "./board.css";
import { C } from "./_components/tokens";

/**
 * Board portal shell.
 *
 * Private by construction: noindex on every page, and no link into it from
 * the public site. The header/footer chrome lives on the signed-in pages
 * rather than here, because /board/signin renders alone on cream with no
 * navigation at all (spec §5.1).
 */
export const metadata: Metadata = {
  title: "Board portal · Ambition Angels",
  description: "Private board portal for directors of Ambition Angels Inc.",
  robots: { index: false, follow: false, nocache: true },
};

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.cream,
        color: C.ink,
        fontFamily: "var(--font-body), 'DM Sans', sans-serif",
      }}
    >
      {children}
    </div>
  );
}
