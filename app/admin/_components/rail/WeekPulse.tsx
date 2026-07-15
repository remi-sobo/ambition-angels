import Link from "next/link";
import { getWeekPulse, type PulseDay } from "@/lib/admin/rail/week-pulse";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * "This week" pulse shelf: a compact 7-day load ribbon (calendar events +
 * planned tasks) that fills the rail's lower half with calm, useful density and
 * links into Monday Plan. Deterministic + RLS-scoped (see lib/admin/rail/week-pulse).
 */

const MAX_BAR = 34; // px
const MIN_BAR = 4; // px — an empty day still shows a faint nub

function barHeight(load: number, max: number): number {
  if (load === 0) return MIN_BAR;
  return Math.round(MIN_BAR + (load / max) * (MAX_BAR - MIN_BAR));
}

function barColor(d: PulseDay): string {
  if (d.load === 0) return "bg-white/[0.07]";
  if (d.isToday) return "bg-orange";
  if (d.isPast) return "bg-white/[0.14]";
  return "bg-[#C77A4A]"; // warm clay for the days ahead
}

export default async function WeekPulse() {
  let pulse;
  try {
    pulse = await getWeekPulse();
  } catch {
    return null; // never break the rail over a pulse read
  }
  const { days, totalEvents, totalTasks } = pulse;
  if (totalEvents === 0 && totalTasks === 0) return null; // nothing to show → stay quiet

  const max = Math.max(1, ...days.map((d) => d.load));

  return (
    <section className="px-5 py-5 border-t border-white/[0.07]">
      <div className="flex items-center justify-between mb-3">
        <h2 className={`flex items-center gap-2 ${TYPE.sectionHeader} !text-[#bfae93]`}>
          <span className="w-[3px] h-3 rounded-full bg-orange" aria-hidden />
          This week
        </h2>
        <Link href="/admin/ops/monday" className="text-[11px] text-[#8d7c63] hover:text-orange-mid transition-colors">
          Plan →
        </Link>
      </div>

      <Link href="/admin/ops/monday" className="block group" aria-label="Open Monday Plan">
        <div className="flex items-end justify-between gap-1" style={{ height: MAX_BAR }}>
          {days.map((d) => (
            <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.events} event${d.events === 1 ? "" : "s"}, ${d.tasks} task${d.tasks === 1 ? "" : "s"}`}>
              <span
                className={`w-[18px] rounded-t-[3px] transition-all ${barColor(d)} ${d.isToday ? "shadow-[0_0_10px_rgba(232,80,10,0.45)]" : ""}`}
                style={{ height: barHeight(d.load, max) }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-1 mt-1.5">
          {days.map((d) => (
            <div key={d.key} className="flex-1 text-center">
              <span className={`text-[10px] font-medium ${d.isToday ? "text-orange-mid font-bold" : d.isPast ? "text-[#6e5f4c]" : "text-[#8d7c63]"}`}>
                {d.dow}
              </span>
            </div>
          ))}
        </div>
      </Link>

      <p className="mt-3 text-[12px] text-[#9c8b70]">
        <span className="text-[#D8C9B3] font-semibold [font-variant-numeric:tabular-nums]">{totalEvents}</span> event{totalEvents === 1 ? "" : "s"}
        <span className="text-[#6e5f4c]"> · </span>
        <span className="text-[#D8C9B3] font-semibold [font-variant-numeric:tabular-nums]">{totalTasks}</span> task{totalTasks === 1 ? "" : "s"} planned
      </p>
    </section>
  );
}
