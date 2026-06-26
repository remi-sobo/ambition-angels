import Link from "next/link";
import { getOrgContext } from "@/lib/admin/auth";
import { getPlanMovement, getRaiseMovement, getHowMovement } from "@/lib/admin/strategy/narrative";
import MovementPlan from "./_components/MovementPlan";
import MovementRaise from "./_components/MovementRaise";
import MovementHow from "./_components/MovementHow";

/**
 * Strategy Narrative — the login-gated, presentation-grade view Remi pulls up
 * live with a funder (spec: specs/strategy-narrative.md). One continuous flow,
 * three movements in fixed order: (1) The Plan, (2) What We Need to Raise,
 * (3) How We Raise It. It reads the OGSM and the money straight from the
 * tables via the read module — nothing here is hardcoded.
 *
 * Phases shipped: Movement 1 (Plan) + Movement 2 (Raise). Movement 3 (How) and
 * presenter mode follow. Server read on every load (force-dynamic, no cache) so
 * a strategy-admin or finance change shows here on next load.
 */
export const dynamic = "force-dynamic";

function MovementNav({ active }: { active: number }) {
  const items = [
    { n: 1, label: "The Plan", live: true },
    { n: 2, label: "What We Raise", live: true },
    { n: 3, label: "How We Raise It", live: true },
  ];
  return (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-3 mb-8 flex-wrap">
      {items.map((it, i) => (
        <span key={it.n} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-ink-3/60">→</span>}
          <a
            href={`#movement-${it.n}`}
            className={
              it.n === active
                ? "text-orange font-semibold"
                : it.live
                  ? "text-ink-2 hover:text-orange"
                  : "text-ink-3/70"
            }
          >
            {it.n} · {it.label}
          </a>
        </span>
      ))}
      <Link
        href="/admin/strategic-plan"
        className="ml-auto normal-case tracking-normal text-ink-2 hover:text-orange hover:underline"
      >
        ← Strategic Plan
      </Link>
    </div>
  );
}

export default async function StrategyNarrativePage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }

  const [plan, money, how] = await Promise.all([
    getPlanMovement(ctx.orgId),
    getRaiseMovement(ctx.orgId),
    getHowMovement(ctx.orgId),
  ]);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-10 max-w-[920px]">
      <MovementNav active={1} />

      <section id="movement-1" className="scroll-mt-6">
        <MovementPlan plan={plan} />
      </section>

      <hr className="my-14 border-hairline" />

      <section id="movement-2" className="scroll-mt-6">
        <MovementRaise money={money} />
      </section>

      <hr className="my-14 border-hairline" />

      <section id="movement-3" className="scroll-mt-6">
        <MovementHow how={how} />
      </section>

      <div className="mt-16 pt-6 border-t border-hairline text-sm text-ink-3">
        Next: <span className="text-ink-2">presenter mode</span> — full-screen, large type, keyboard
        navigation between movements. Coming in the next phase.
      </div>
    </div>
  );
}
