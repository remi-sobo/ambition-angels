// YGB marks recreated as crisp inline SVG so they scale cleanly and theme per
// surface. Two lockups: the master "YGB / Young. Gifted. Black." and the
// "YGB / Creators Camp" program mark. If official vector exports land in
// /public, swap these for <img>.

// Hand-drawn crown: two open rings on the outer points, a tall center spike,
// and the signature looping, slightly-tilted halo at the base.
export function YgbCrown({ size = 96, color = "#D4AF37", style }) {
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
      <g stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* center spike */}
        <path d="M100 148 L128 38 L156 148" />
        {/* outer stalks rising to the rings */}
        <path d="M90 148 C 82 124 78 103 80 94" />
        <path d="M170 148 C 178 121 182 94 186 77" />
        {/* ring jewels (asymmetric, hand-drawn) */}
        <circle cx="80" cy="79" r="14" />
        <circle cx="187" cy="62" r="14" />
        {/* single clean looping halo base, tilted up to the right */}
        <path d="M66 150 C 68 163 120 169 161 165 C 199 161 213 152 203 144 C 194 137 150 133 110 137 C 83 140 64 141 66 150 Z" />
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
