import Link from "next/link";
import { getStrategyGlance } from "@/lib/admin/plan/glance";
import { healthLabel } from "@/lib/admin/plan/health";
import { planHealthToStatus, type Status } from "@/lib/admin/status";
import { StatusChip } from "@/app/admin/_components/StatusChip";
import type { StrategyHeadlineKpi } from "@/lib/admin/overview/sources";

// The Org-lens glance (Phase B1): a deterministic verdict line, the "Needs
// attention" exception list, and the objective grid — the three-second "are we
// winning" read above the editable plan tree. Management by exception: healthy
// tiles recede, off-track tiles carry a warm accent and a badge. Read-only over
// getStrategyRollup; the lens switch and per-person filtering land in B2.

// Off-track tiles advance; healthy/neutral ones stay quiet (just the outline).
const TILE_ACCENT: Record<Status, string> = {
  critical: "border-status-critical/50 bg-status-critical-bg/40",
  watch: "border-status-watch/50 bg-status-watch-bg/40",
  due: "border-outline bg-surface",
  healthy: "border-outline bg-surface",
  neutral: "border-outline bg-surface",
};

const BAR: Record<Status, string> = {
  critical: "bg-status-critical",
  watch: "bg-status-watch",
  due: "bg-status-due",
  healthy: "bg-status-healthy",
  neutral: "bg-ink-3",
};

const fmt = (v: number, unit: string | null): string => {
  if (unit === "$") return Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v.toLocaleString()}`;
  if (unit === "%") return `${Math.round(v)}%`;
  return v.toLocaleString();
};

function MeasureRow({ m }: { m: StrategyHeadlineKpi }) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-[11px] text-ink-2 truncate min-w-0 flex-1">{m.title}</span>
      <div className="w-10 h-1.5 rounded-full bg-tile overflow-hidden shrink-0">
        <div className={`h-full ${BAR[planHealthToStatus(m.status)]}`} style={{ width: `${m.pct}%` }} />
      </div>
      <span className="text-[10px] text-ink-2 tabular-nums shrink-0 w-14 text-right">
        {fmt(m.current, m.unit)}
        <span className="text-ink-3">/{fmt(m.target, m.unit)}</span>
      </span>
    </li>
  );
}

export default async function StrategyGlance() {
  const { hasPlan, objectives, verdict, exceptions } = await getStrategyGlance();
  if (!hasPlan) return null;

  return (
    <div className="space-y-4 mb-8">
      <p className="font-heading text-lg text-ink-1 leading-snug">{verdict}</p>

      {exceptions.length > 0 && (
        <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-2">Needs attention</h2>
          <ul className="divide-y divide-hairline">
            {exceptions.map((e) => (
              <li key={e.id}>
                <Link href={e.href} className="group flex items-center gap-3 py-2.5">
                  <StatusChip status={e.chip} className="shrink-0">{e.chipLabel}</StatusChip>
                  <span className="text-sm text-ink-1 flex-1 min-w-0 truncate group-hover:text-orange transition-colors">
                    {e.detail}
                  </span>
                  {e.owner && <span className="text-[11px] text-ink-2 shrink-0">{e.owner}</span>}
                  <span className="text-ink-3 shrink-0" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {objectives.map((o) => {
          const status = planHealthToStatus(o.health);
          return (
            <Link
              key={o.id}
              href={`#objective-${o.id}`}
              className={`block rounded-card-lg border-[1.5px] p-4 transition-colors hover:border-orange/40 ${TILE_ACCENT[status]}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className="font-heading font-semibold text-ink-1 text-sm leading-tight min-w-0">{o.title}</h3>
                <StatusChip status={status} className="shrink-0">{healthLabel(o.health)}</StatusChip>
              </div>
              {o.owner && <p className="text-[11px] text-ink-2 mb-1.5">{o.owner}</p>}
              {o.kpisOffTrack > 0 && (
                <p className="text-[11px] text-status-critical-text font-semibold mb-1.5">
                  {o.kpisOffTrack} off target
                </p>
              )}
              {o.measures.length > 0 ? (
                <ul className="space-y-1.5 mt-2">
                  {o.measures.map((m) => (
                    <MeasureRow key={m.id} m={m} />
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-ink-3 mt-1">No measures yet</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
