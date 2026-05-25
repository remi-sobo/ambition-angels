// YGB Academy mark recreated as crisp inline SVG (gold crown) + wordmark so it
// scales cleanly on any background and themes per surface. If an official
// vector export becomes available, drop it in /public and swap these out.

export function YgbCrown({ size = 96, color = "#FFD700", style }) {
  const w = size;
  const h = (size * 150) / 240;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 240 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={style}
    >
      <g stroke={color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="58" cy="34" r="13" />
        <circle cx="182" cy="34" r="13" />
        <path d="M38 108 L58 50 L92 84 L120 32 L148 84 L182 50 L202 108" />
        <path d="M34 116 C90 134 150 134 206 114" />
      </g>
    </svg>
  );
}

export default function YgbLogo({ crownSize = 54, textColor = "#F0EAD6", gold = "#FFD700" }) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <YgbCrown size={crownSize * 1.6} color={gold} style={{ marginBottom: -crownSize * 0.12 }} />
      <div
        style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: crownSize,
          lineHeight: 0.9,
          letterSpacing: "0.04em",
          color: textColor,
        }}
      >
        YGB
      </div>
      <div style={{ width: "100%", height: 2, background: textColor, opacity: 0.85, margin: "3px 0" }} />
      <div
        style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: crownSize * 0.34,
          letterSpacing: "0.5em",
          color: textColor,
          paddingLeft: "0.5em",
        }}
      >
        ACADEMY
      </div>
    </div>
  );
}
