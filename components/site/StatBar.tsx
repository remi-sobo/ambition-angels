import type { Stat } from "@/lib/stats";

/** Four-across stat bar (two-across on phones). Numbers come from lib/stats.ts. */
export default function StatBar({ items, onDark = true }: { items: Stat[]; onDark?: boolean }) {
  return (
    <div className="aa-stat-grid" style={{ display: "grid", gap: "2rem", textAlign: "center" }}>
      {items.map((s) => (
        <div key={s.label}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              textTransform: "uppercase",
              fontSize: "clamp(56px,6vw,72px)",
              lineHeight: 1,
              letterSpacing: "-0.01em",
              color: "var(--orange)",
              marginBottom: 6,
            }}
          >
            {s.value}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: onDark ? "var(--gray-mid)" : "var(--muted)" }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
