// YGB marks recreated as crisp inline SVG so they scale cleanly and theme per
// surface. Two lockups: the master "YGB / Young. Gifted. Black." and the
// "YGB / Creators Camp" program mark. If official vector exports land in
// /public, swap these for <img>.

// Hand-drawn crown: two open rings on the outer points, a tall center spike,
// and the signature looping, slightly-tilted halo at the base.
export function YgbCrown({ size = 96, color = "#E9C84A", style }) {
  const w = size;
  const h = (size * 210) / 260;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 260 210"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={style}
    >
      <g stroke={color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* center spike */}
        <path d="M99 150 L128 36 L157 150" />
        {/* outer stalks rising to the rings */}
        <path d="M88 150 C 80 124 76 102 78 93" />
        <path d="M168 150 C 176 120 181 92 185 75" />
        {/* ring jewels (asymmetric, hand-drawn) */}
        <circle cx="78" cy="78" r="15" />
        <circle cx="186" cy="61" r="15" />
        {/* looping, tilted halo base */}
        <path d="M60 158 C 74 176 170 179 200 154 C 210 146 202 137 189 142 C 160 152 96 151 80 139 C 69 132 58 149 65 157" />
      </g>
    </svg>
  );
}

export default function YgbLogo({
  crownSize = 54,
  color = "#F0EAD6",
  gold = "#FFD700",
  tagline = "YOUNG. GIFTED. BLACK.",
  marker = false,
}) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <YgbCrown size={crownSize * 2} color={gold} style={{ marginBottom: -crownSize * 0.34 }} />
      <div
        style={{
          fontFamily: "'Arial Black','Helvetica Neue',Helvetica,Arial,sans-serif",
          fontWeight: 900,
          fontSize: crownSize * 1.5,
          lineHeight: 0.85,
          letterSpacing: "0.01em",
          color,
        }}
      >
        YGB
      </div>
      <div style={{ width: "108%", height: 2, background: color, opacity: 0.9, margin: "4px 0 5px" }} />
      {marker ? (
        <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: crownSize * 0.6, letterSpacing: "0.02em", color }}>
          {tagline}
        </div>
      ) : (
        <div
          style={{
            fontFamily: "'Bebas Neue',sans-serif",
            fontSize: crownSize * 0.42,
            letterSpacing: "0.2em",
            color,
            paddingLeft: "0.2em",
          }}
        >
          {tagline}
        </div>
      )}
    </div>
  );
}
