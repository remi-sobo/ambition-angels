"use client";

import { useEffect } from "react";
import { C, F } from "./tokens";

/**
 * Opens the browser print dialog on arrival, and offers a visible button for
 * anyone who dismisses it.
 *
 * "Save as PDF" in that dialog is the export. There is no server-side PDF
 * renderer, deliberately: it would be a second rendering path that drifts from
 * the screen, and it would need a headless browser in the Vercel runtime for a
 * document produced a handful of times a year.
 */
export default function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="board-noprint"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 32px 0",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          height: 44,
          padding: "0 20px",
          borderRadius: 999,
          border: "none",
          background: C.ink,
          color: C.cream,
          fontFamily: F.body,
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Print or save as PDF
      </button>
      <span style={{ fontSize: 15, color: C.muted, fontFamily: F.body }}>
        Choose &ldquo;Save as PDF&rdquo; as the destination to file this in the minute book.
      </span>
    </div>
  );
}
