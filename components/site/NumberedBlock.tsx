import type { CSSProperties, ReactNode } from "react";

/** Big Shoulders numeral in orange at left, title beside it. Real sequences only. */
export default function NumberedBlock({
  number,
  title,
  eyebrow,
  children,
  style,
}: {
  number: string;
  title: string;
  eyebrow?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start", ...style }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 56,
          lineHeight: 1,
          color: "var(--orange)",
          flexShrink: 0,
          minWidth: 56,
        }}
      >
        {number}
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 17, color: "var(--ink)", margin: 0 }}>
            {title}
          </h3>
          {eyebrow && (
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--orange)",
              }}
            >
              {eyebrow}
            </span>
          )}
        </div>
        {children && (
          <div style={{ fontFamily: "var(--font-body)", fontSize: 14.5, lineHeight: 1.6, color: "var(--charcoal)", marginTop: 6 }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
