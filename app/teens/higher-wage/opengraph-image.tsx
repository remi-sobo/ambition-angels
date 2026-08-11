import { ImageResponse } from "next/og";

// Share card for Higher Wage (Phase 3 definition of done: renders in an
// iMessage preview). Drawn with satori-safe flex + system fonts — no
// external font fetch, nothing to break at the edge.
export const runtime = "edge";
export const alt = "Higher Wage: two real jobs, tap the one that pays more";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  width: 330,
  height: 260,
  borderRadius: 28,
  border: "3px solid rgba(250,250,248,0.25)",
  background: "rgba(250,250,248,0.05)",
};

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0E0E0E",
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 2px, transparent 2px)",
          backgroundSize: "44px 44px",
          color: "#FAFAF8",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: 10,
            color: "rgba(250,250,248,0.55)",
            textTransform: "uppercase",
          }}
        >
          Which pays more?
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 110,
            fontWeight: 800,
            textTransform: "uppercase",
            marginTop: 8,
            letterSpacing: -2,
          }}
        >
          <span style={{ marginRight: 28 }}>Higher</span>
          <span style={{ color: "#E8500A" }}>Wage</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 36 }}>
          <div style={card}>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#E8500A" }}>$ ?</div>
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "rgba(250,250,248,0.5)", textTransform: "uppercase", letterSpacing: 6 }}>
            vs
          </div>
          <div style={card}>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#E8500A" }}>$ ?</div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "rgba(250,250,248,0.5)", marginTop: 40 }}>
          Real jobs, real pay · free · ambitionangels.org/teens
        </div>
      </div>
    ),
    { ...size }
  );
}
