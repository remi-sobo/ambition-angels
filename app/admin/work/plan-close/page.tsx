import Link from "next/link";
import PlanSection from "@/app/admin/ops/monday/PlanSection";
import CloseSection from "@/app/admin/ops/friday/CloseSection";
import { resolveRitual, ritualForToday } from "@/lib/admin/ops/planClose";

// Spec Work W1 — Plan & Close, the merged ritual screen (recon §G: a
// recomposition of /admin/ops/monday + /admin/ops/friday). One screen, both
// rituals: the switch is URL-driven (?ritual=plan|close — decision 1,
// resolved), the default follows rhythmModeForToday() exactly as the doors
// page did, and the ritual bodies are the extracted V1 sections rendered
// unmodified — same wizard steps, same rhythm_sessions writes, same task
// actions. Composition order: switch → the one lit ritual.
//
// Dark-launched at W1: reachable, but the Plan & Close tab keeps resolving
// to /admin/ops/monday (liveSeatFor's first-source rule) until the W4
// cutover activates the map rows and this seat links itself.
export const dynamic = "force-dynamic";

const PILLS: Array<{ ritual: "plan" | "close"; label: string; eyebrow: string }> = [
  { ritual: "plan", label: "Plan", eyebrow: "Monday · Aim" },
  { ritual: "close", label: "Close", eyebrow: "Friday · Account" },
];

export default async function PlanClosePage({
  searchParams,
}: {
  searchParams?: { ritual?: string };
}) {
  const ritual = resolveRitual(searchParams?.ritual);
  const lit = ritualForToday();

  return (
    <div>
      {/* ── The ritual switch ──────────────────────────────────────────── */}
      <nav
        aria-label="Ritual"
        className="max-w-6xl px-4 lg:px-8 pt-6 lg:pt-8 flex items-center gap-2"
      >
        {PILLS.map((p) => {
          const active = p.ritual === ritual;
          return (
            <Link
              key={p.ritual}
              href={`/admin/work/plan-close?ritual=${p.ritual}`}
              className={[
                "inline-flex items-baseline gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-orange-light text-orange-dark border-orange/40"
                  : "bg-surface text-ink-2 border-outline hover:bg-[#EFE6D4]",
              ].join(" ")}
            >
              <span>{p.label}</span>
              <span className={active ? "text-orange-dark/70 text-[10px] uppercase tracking-wider" : "text-ink-3 text-[10px] uppercase tracking-wider"}>
                {p.eyebrow}
              </span>
              {p.ritual === lit && (
                <span className="text-[9px] uppercase tracking-wider font-semibold text-orange-dark border border-orange/40 rounded-full px-1.5 py-px">
                  Now
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── The lit ritual, verbatim ───────────────────────────────────── */}
      <div className="-mt-2">{ritual === "plan" ? <PlanSection /> : <CloseSection />}</div>
    </div>
  );
}
