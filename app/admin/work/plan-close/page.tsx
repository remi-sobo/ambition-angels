import PlanSection from "@/app/admin/ops/monday/PlanSection";
import CloseSection from "@/app/admin/ops/friday/CloseSection";
import { resolveRitual, ritualForToday } from "@/lib/admin/ops/planClose";
import SegmentedControl, { type Segment } from "@/app/admin/_components/ui/SegmentedControl";
import Badge from "@/app/admin/_components/ui/Badge";

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

/**
 * Visual System V3 §6 — Plan & Close had too many competing navigation
 * patterns: the shell's tab row, then a pair of capsule links, then five more
 * capsules for the workflow steps. Three rows of near-identical pills, none of
 * which said which level it belonged to.
 *
 * V3 gives the screen three DISTINCT levels, and this file owns level 2:
 *
 *   Level 1  Work navigation tabs        → V2TabZone (shell, §5)
 *   Level 2  Plan / Close                → the segmented control below
 *   Level 3  Workflow progress           → RhythmWizard's stepper (§6)
 */
const SEGMENTS: Segment<"plan" | "close">[] = [
  { value: "plan", label: "Plan", hint: "Monday · Aim" },
  { value: "close", label: "Close", hint: "Friday · Account" },
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
      {/* ── Level 2: the ritual switch ─────────────────────────────────── */}
      <div className="max-w-workspace px-4 lg:px-8 pt-6 lg:pt-8">
        <SegmentedControl
          label="Ritual"
          value={ritual}
          hrefFor={(r) => `/admin/work/plan-close?ritual=${r}`}
          segments={SEGMENTS.map((seg) =>
            seg.value === lit
              ? {
                  ...seg,
                  // §13: "now" is a word, not a color — it survives greyscale
                  // and it is read out by assistive tech.
                  marker: <Badge tone="accent">Now</Badge>,
                }
              : seg,
          )}
        />
      </div>

      {/* ── Level 3 + the ritual body, verbatim ────────────────────────── */}
      <div>{ritual === "plan" ? <PlanSection /> : <CloseSection />}</div>
    </div>
  );
}
