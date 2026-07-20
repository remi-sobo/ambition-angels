import FinanceSnapshotWidget from "./FinanceSnapshotWidget";
import GoalForecastWidget from "./GoalForecastWidget";
import StrategyHealthWidget from "./StrategyHealthWidget";
import TodayAgenda from "./TodayAgenda";
import MyQueueWidget from "./MyQueueWidget";
import MovesOnlyYouWidget from "./MovesOnlyYouWidget";
import { getCockpitTitle } from "@/lib/admin/overview/sources";

// The principal's cockpit — the Command Center's single curated view now that
// the CEO/Ops pill toggle is retired. Finance + fundraising up top (where we
// stand on money), then the schedule and the viewer's own to-dos (their day),
// then partners to follow up (who to chase).
//
// The title is per-org data (orgs.settings.cockpit_title) so it reads right for
// each tenant's principal — "CEO Cockpit" here, "Area Director" for a Young Life
// AD — and stands in for the label the pill used to carry. Every widget is
// org-scoped (RLS / active org), and the to-dos are scoped to the signed-in
// person, so this same view serves whoever is logged in.

export default async function CeoCockpit() {
  const title = await getCockpitTitle();

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
