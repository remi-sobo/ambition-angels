import Link from "next/link";
import { getOrgContext } from "@/lib/admin/auth";
import { getPlanMovement, getRaiseMovement, getHowMovement } from "@/lib/admin/strategy/narrative";
import { getReadiness } from "@/lib/admin/strategy/readiness";
import MovementPlan from "./_components/MovementPlan";
import MovementRaise from "./_components/MovementRaise";
import MovementHow from "./_components/MovementHow";
import Presenter from "./_components/Presenter";

/**
 * Strategy Narrative — the login-gated, presentation-grade view Remi pulls up
 * live with a funder (spec: specs/strategy-narrative.md). One continuous flow,
 * three movements in fixed order: (1) The Plan, (2) What We Need to Raise,
 * (3) How We Raise It. It reads the OGSM and the money straight from the
 * tables via the read module — nothing here is hardcoded.
 *
 * Two views off the same server-fetched data: the scrolling page, and presenter
 * mode (?present=1) — full-screen, one movement per slide, keyboard nav.
 * Server read on every load (force-dynamic, no cache) so a strategy-admin or
 * finance change shows here on next load.
 */
export const dynamic = "force-dynamic";

function MovementNav() {
  const items = [
    { n: 1, label: "The Plan" },
    { n: 2, label: "What We Raise" },
    { n: 3, label: "How We Raise It" },
  ];
  return (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-3 mb-8 flex-wrap">
      {items.map((it, i) => (
        <span key={it.n} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-ink-3/60">→</span>}
          <a href={`#movement-${it.n}`} className={it.n === 1 ? "text-orange font-semibold" : "text-ink-2 hover:text-orange"}>
            {it.n} · {it.label}
          </a>
        </span>
      ))}
      <span className="ml-auto flex items-center gap-3 normal-case tracking-normal">
        <Link href="/admin/strategic-plan/narrative?present=1" className="font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1 rounded-full">
          ▶ Present
        </Link>
        <Link href="/admin/strategic-plan" className="text-ink-2 hover:text-orange hover:underline">
          ← Strategic Plan
        </Link>
      </span>
    </div>
  );
}

export default async function StrategyNarrativePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }

  const [plan, money, how] = await Promise.all([
    getPlanMovement(ctx.orgId),
    getRaiseMovement(ctx.orgId),
    getHowMovement(ctx.orgId),
  ]);

  const movements = [
    { title: "The Plan", node: <MovementPlan plan={plan} /> },
    { title: "What We Need to Raise", node: <MovementRaise money={money} /> },
    { title: "How We Raise It", node: <MovementHow how={how} /> },
  ];

  // Funder-readiness, graded against these same movements — gates the presenter
  // and warns on the prep view.
  const readiness = await getReadiness(ctx.orgId);
  const openBlockers = readiness.blockers.filter((b) => !b.ok).map((b) => b.label);

  // Presenter mode — full-screen slides over the same data, keyboard-driven.
  if (searchParams?.present === "1") {
    return (
      <Presenter
        slides={movements.map((m) => m.node)}
        titles={movements.map((m) => m.title)}
        blockers={openBlockers}
      />
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-10 max-w-[920px]">
      {readiness.blockerCount > 0 && (
        <div className="mb-6 rounded-card border-[1.5px] border-expense/30 bg-expense-bg px-4 py-3 text-sm">
          <span className="font-semibold text-ink-1">
            {readiness.blockerCount} funder-readiness blocker{readiness.blockerCount === 1 ? "" : "s"} open.
          </span>{" "}
          <span className="text-ink-2">Clear these before presenting —</span>{" "}
          <Link href="/admin/strategic-plan" className="font-semibold text-orange hover:underline">
            see the checklist
          </Link>
          .
        </div>
      )}
      <MovementNav />

      <section id="movement-1" className="scroll-mt-6">
        {movements[0].node}
      </section>

      <hr className="my-14 border-hairline" />

      <section id="movement-2" className="scroll-mt-6">
        {movements[1].node}
      </section>

      <hr className="my-14 border-hairline" />

      <section id="movement-3" className="scroll-mt-6">
        {movements[2].node}
      </section>

      <div className="mt-16 pt-6 border-t border-hairline text-sm text-ink-3">
        Tip: hit{" "}
        <Link href="/admin/strategic-plan/narrative?present=1" className="text-orange hover:underline">
          Present
        </Link>{" "}
        for a full-screen, keyboard-driven walk-through (← → between movements, Esc to exit).
      </div>
    </div>
  );
}
