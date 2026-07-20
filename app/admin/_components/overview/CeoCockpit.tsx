import FinanceSnapshotWidget from "./FinanceSnapshotWidget";
import GoalForecastWidget from "./GoalForecastWidget";
import StrategyHealthWidget from "./StrategyHealthWidget";
import TodayAgenda from "./TodayAgenda";
import MyQueueWidget from "./MyQueueWidget";
import MovesOnlyYouWidget from "./MovesOnlyYouWidget";

// The principal's cockpit — the Command Center's single curated view now that
// the CEO/Ops pill toggle is retired. Finance + fundraising up top (where we
// stand on money), then the schedule and the viewer's own to-dos (their day),
// then partners to follow up (who to chase).
//
// The header is named after the signed-in person ("Remi's Cockpit") — it stands
// in for the label the pill used to carry, and reads right for whoever is logged
// in on any tenant, no per-org config. Every widget is org-scoped (RLS / active
// org) and the to-dos are scoped to the viewer, so this one view serves everyone.

export default function CeoCockpit({ ownerName }: { ownerName?: string | null }) {
  const name = ownerName?.trim();
  const title = name ? `${name}'s Cockpit` : "Your Cockpit";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-orange/15 text-orange-mid"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 12l4-2.5M12 12v-4.5" />
          </svg>
        </span>
        <h2 className="font-heading font-semibold text-cream text-lg leading-tight">{title}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <FinanceSnapshotWidget className="lg:col-span-5" />
        <GoalForecastWidget className="lg:col-span-7" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <StrategyHealthWidget className="lg:col-span-6" />
        <TodayAgenda className="lg:col-span-6" />
      </div>

      <MyQueueWidget title="My to-dos" />

      <MovesOnlyYouWidget title="Partners to follow up" />
    </div>
  );
}
