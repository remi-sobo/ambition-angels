import { ImageResponse } from "next/og";

// Share card for Never Heard of It — the squares ARE the brand of a
// daily guessing game, so they carry the image.
export const runtime = "edge";
export const alt = "Never Heard of It: one mystery career a day, eight clues to name it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const square = (color: string): React.CSSProperties => ({
  display: "flex",
  width: 86,
  height: 86,
  borderRadius: 16,
  background: color,
});

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
          One mystery career a day
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 800,
            textTransform: "uppercase",
            marginTop: 10,
            letterSpacing: -2,
            textAlign: "center",
          }}
        >
          <span style={{ marginRight: 24 }}>Never heard</span>
          <span style={{ color: "#E8500A" }}>of it</span>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 44 }}>
          {["#E8500A", "#E8500A", "#E8500A", "#2FA463", "#3D3D3D", "#3D3D3D", "#3D3D3D", "#3D3D3D"].map(
            (c, i) => (
              <div key={i} style={square(c)} />
            )
          )}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "rgba(250,250,248,0.5)", marginTop: 44 }}>
          Eight clues to name it · same job for everyone · ambitionangels.org/teens
        </div>
      </div>
    ),
    { ...size }
  );
}
