// SVG chart primitives for the finance dashboard. Hand-rolled rather than
// pulling in a chart library — the dashboard renders five chart shapes total
// and every one is small enough that direct SVG is cleaner than wrangling a
// general-purpose library's configuration. All components are pure functions
// of their props (server-renderable, no client hooks).

const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const NUM_2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  return NUM_2.format(n);
}

// ── Donut ──────────────────────────────────────────────────────────────────
// Segment slices rendered as stroked arcs on a single circle. We use stroke-
// dasharray = `<arc_length> <total - arc_length>` and stroke-dashoffset to
// position each slice. Bigger / first slice is the most visually prominent,
// so segments come in descending order.

export type DonutSeg = { label: string; value: number; color: string };

export function Donut({
  segments,
  total,
  size = 220,
  thickness = 28,
  centerLabel,
  centerValue,
  formatValue = money,
}: {
  segments: DonutSeg[];
  total?: number;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  /** Legend value formatter — defaults to currency for the finance pages. */
  formatValue?: (n: number) => string;
}) {
  const sum = total ?? segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {sum > 0 &&
          segments.map((seg, i) => {
            const frac = seg.value / sum;
            const len = frac * c;
            const dash = `${len} ${c - len}`;
            const out = offset;
            offset += len;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-out}
                strokeLinecap="butt"
                // Rotate -90deg so 0% starts at 12 o'clock.
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
        {(centerLabel || centerValue) && (
          <g>
            {centerValue && (
              <text
                x={size / 2}
                y={size / 2 - 4}
                textAnchor="middle"
                className="fill-cream font-display font-black"
                fontSize={size * 0.18}
              >
                {centerValue}
              </text>
            )}
            {centerLabel && (
              <text
                x={size / 2}
                y={size / 2 + 18}
                textAnchor="middle"
                className="fill-[#6B6960]"
                fontSize={11}
                letterSpacing={1.5}
              >
                {centerLabel}
              </text>
            )}
          </g>
        )}
      </svg>
      <ul className="space-y-1.5 text-xs flex-1 min-w-0">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-cream/80 truncate flex-1">{s.label}</span>
            <span className="text-gray-mid font-mono">
              {sum > 0 ? `${Math.round((s.value / sum) * 100)}%` : "—"}
            </span>
            <span className="text-cream font-mono w-20 text-right">{formatValue(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Circle gauge ──────────────────────────────────────────────────────────
// Single-arc progress around a ring. Used for "Raised YTD vs Goal" and
// "Spent YTD vs Budget" hero tiles.

export function CircleGauge({
  pct,
  size = 130,
  thickness = 14,
  color = "#E8500A",
  trackColor = "rgba(255,255,255,0.08)",
  label,
  value,
}: {
  pct: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  value?: string;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const dash = `${clamped * c} ${c - clamped * c}`;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={dash}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {value && (
          <span className="font-display font-black text-cream text-xl leading-none">{value}</span>
        )}
        {label && (
          <span className="mt-1 text-[10px] uppercase tracking-wider text-gray-mid">{label}</span>
        )}
      </div>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────
// Tiny monotonic line, no axis labels. Used inside stat cards.

export function Sparkline({
  values,
  width = 120,
  height = 36,
  color = "#E8500A",
  fill,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
}) {
  if (values.length < 2) {
    return <svg width={width} height={height} aria-hidden />;
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const fillD = fill ? `${d} L${width},${height} L0,${height} Z` : "";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {fill && <path d={fillD} fill={fill} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {/* Endpoint dot */}
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}

// ── Cash flow 12-month bar chart ───────────────────────────────────────────
// Revenue bars rise up from the zero line; expense bars hang down. An
// optional balance line overlays the trajectory of ending balance.

export type MonthBucket = {
  label: string; // "Jan"
  revenue: number;
  expense: number; // positive number representing outflow magnitude
  ending: number; // running ending balance for the month
};

export function CashFlowChart({
  data,
  width = 920,
  height = 280,
}: {
  data: MonthBucket[];
  width?: number;
  height?: number;
}) {
  const pad = { top: 24, right: 24, bottom: 36, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = data.length;
  if (n === 0) return <div className="text-sm text-gray-mid">No data yet — upload a CSV to populate.</div>;

  const maxRev = Math.max(0, ...data.map((d) => d.revenue));
  const maxExp = Math.max(0, ...data.map((d) => d.expense));
  const yMax = Math.max(maxRev, maxExp) || 1;
  const minBal = Math.min(0, ...data.map((d) => d.ending));
  const maxBal = Math.max(0, ...data.map((d) => d.ending));
  // Independent left axis (bars) and right axis (balance line) — use the
  // same vertical pixel range so the chart reads cleanly.
  const yScale = (v: number) => (v / yMax) * (innerH / 2);
  const balRange = maxBal - minBal || 1;
  const balScale = (v: number) => innerH - ((v - minBal) / balRange) * innerH;

  const barW = innerW / n;
  const innerBarW = Math.max(8, barW * 0.55);
  const zeroY = pad.top + innerH / 2;

  const balPath = data
    .map((d, i) => {
      const x = pad.left + i * barW + barW / 2;
      const y = pad.top + balScale(d.ending);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* y-axis grid */}
      {[0.5, 1].map((p) => (
        <line
          key={p}
          x1={pad.left}
          x2={pad.left + innerW}
          y1={zeroY - innerH * 0.5 * p}
          y2={zeroY - innerH * 0.5 * p}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />
      ))}
      {[0.5, 1].map((p) => (
        <line
          key={"n" + p}
          x1={pad.left}
          x2={pad.left + innerW}
          y1={zeroY + innerH * 0.5 * p}
          y2={zeroY + innerH * 0.5 * p}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />
      ))}
      <line
        x1={pad.left}
        x2={pad.left + innerW}
        y1={zeroY}
        y2={zeroY}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={1}
      />

      {/* Bars */}
      {data.map((d, i) => {
        const cx = pad.left + i * barW + barW / 2;
        const revH = yScale(d.revenue);
        const expH = yScale(d.expense);
        return (
          <g key={i}>
            {d.revenue > 0 && (
              <rect
                x={cx - innerBarW / 2}
                y={zeroY - revH}
                width={innerBarW}
                height={revH}
                rx={2}
                fill="#10b981"
                opacity={0.85}
              />
            )}
            {d.expense > 0 && (
              <rect
                x={cx - innerBarW / 2}
                y={zeroY}
                width={innerBarW}
                height={expH}
                rx={2}
                fill="#E8500A"
                opacity={0.85}
              />
            )}
            <text
              x={cx}
              y={height - pad.bottom + 16}
              textAnchor="middle"
              className="fill-[#6B6960]"
              fontSize={10}
              letterSpacing={1}
            >
              {d.label}
            </text>
          </g>
        );
      })}

      {/* Balance line */}
      <path
        d={balPath}
        fill="none"
        stroke="#FAFAF8"
        strokeWidth={2}
        strokeLinejoin="round"
        opacity={0.85}
      />
      {data.map((d, i) => {
        const x = pad.left + i * barW + barW / 2;
        const y = pad.top + balScale(d.ending);
        return <circle key={i} cx={x} cy={y} r={3} fill="#FAFAF8" />;
      })}

      {/* y-axis labels (left = ±max for bars, right = balance) */}
      <text x={pad.left - 8} y={zeroY - innerH * 0.5 + 4} textAnchor="end" className="fill-[#6B6960]" fontSize={10}>
        +{money(yMax)}
      </text>
      <text x={pad.left - 8} y={zeroY + 4} textAnchor="end" className="fill-[#6B6960]" fontSize={10}>
        0
      </text>
      <text x={pad.left - 8} y={zeroY + innerH * 0.5 + 4} textAnchor="end" className="fill-[#6B6960]" fontSize={10}>
        −{money(yMax)}
      </text>
      <text
        x={pad.left + innerW + 8}
        y={pad.top + balScale(maxBal) + 4}
        className="fill-cream/70"
        fontSize={10}
      >
        {money(maxBal)}
      </text>

      {/* Legend */}
      <g transform={`translate(${pad.left} ${pad.top - 12})`}>
        <Swatch x={0} fill="#10b981" label="Revenue" />
        <Swatch x={90} fill="#E8500A" label="Expense" />
        <g transform="translate(180 0)">
          <line x1={0} x2={16} y1={4} y2={4} stroke="#FAFAF8" strokeWidth={2} />
          <text x={22} y={8} className="fill-[#6B6960]" fontSize={10}>
            Ending balance
          </text>
        </g>
      </g>
    </svg>
  );
}

function Swatch({ x, fill, label }: { x: number; fill: string; label: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect width={10} height={10} rx={2} fill={fill} />
      <text x={16} y={9} className="fill-[#6B6960]" fontSize={10}>
        {label}
      </text>
    </g>
  );
}

// ── Horizontal progress bar (for budget vs actual table) ──────────────────

export function ProgressBar({
  pct,
  intent = "ok",
  height = 6,
}: {
  pct: number; // 0..1+
  intent?: "ok" | "warn" | "over";
  height?: number;
}) {
  const c = intent === "over" ? "#ef4444" : intent === "warn" ? "#f59e0b" : "#E8500A";
  const trackC = "rgba(255,255,255,0.06)";
  const fillPct = Math.min(1, Math.max(0, pct));
  const overflow = pct > 1 ? Math.min(1, pct - 1) : 0;
  return (
    <div
      className="relative w-full rounded-full overflow-hidden"
      style={{ background: trackC, height }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${fillPct * 100}%`, background: c }}
      />
      {overflow > 0 && (
        <div
          className="absolute inset-y-0 right-0 rounded-full"
          style={{ width: `${overflow * 100}%`, background: "#ef4444", opacity: 0.7 }}
        />
      )}
    </div>
  );
}

// Helpers exported for callers — kept here so they're co-located with the
// chart components that consume them.
export const fmtMoney = money;
export const fmtNumber = NUM.format;
