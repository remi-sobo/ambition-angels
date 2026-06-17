import { createServerSupabase } from "@/lib/supabase/server";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { NewJourneyForm, JourneyActions } from "./_components/JourneyControls";

// Epic J — journey automation: triggered, multi-step email sequences that act
// on the retention signals BloomOS already computes. The hourly cron enrolls
// and advances; this page builds and manages them.
export const dynamic = "force-dynamic";

const TRIGGER_LABEL: Record<string, string> = {
  first_gift: "First gift → welcome",
  lapsed: "Lapsed → re-engage",
  manual: "Manual",
};

export default async function JourneysPage() {
  const supabase = createServerSupabase();
  const [journeysRes, stepsRes, enrollRes] = await Promise.all([
    supabase.from("journeys").select("id, name, trigger, status, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("journey_steps").select("journey_id").limit(5000),
    supabase.from("journey_enrollments").select("journey_id, status").limit(20000),
  ]);

  if (journeysRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-ink-1 text-2xl mb-4">Journeys</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The journeys tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_journeys.sql</code>, then reload.
        </div>
      </div>
    );
  }

  const journeys = (journeysRes.data ?? []) as Array<{ id: string; name: string; trigger: string; status: string }>;
  const stepCounts = new Map<string, number>();
  for (const s of (stepsRes.data ?? []) as Array<{ journey_id: string }>) {
    stepCounts.set(s.journey_id, (stepCounts.get(s.journey_id) ?? 0) + 1);
  }
  const activeEnroll = new Map<string, number>();
  let totalActive = 0;
  for (const e of (enrollRes.data ?? []) as Array<{ journey_id: string; status: string }>) {
    if (e.status === "active") {
      activeEnroll.set(e.journey_id, (activeEnroll.get(e.journey_id) ?? 0) + 1);
      totalActive++;
    }
  }
  const liveJourneys = journeys.filter((j) => j.status === "active").length;

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader title="Journeys" subtitle="Automated, triggered email sequences" />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-w-[18rem]">
            <StatCard label="Journeys" value={journeys.length} />
            <StatCard label="Active" value={liveJourneys} />
            <StatCard label="People enrolled" value={totalActive} sub="currently in a sequence" />
          </div>
          <NewJourneyForm />
        </div>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          {journeys.length === 0 ? (
            <p className="p-8 text-ink-2 text-sm">
              No journeys yet. Create a first-gift welcome series or a lapsed-donor re-engagement —
              the hourly cron enrolls and sends automatically (do-not-contact always honored).
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {journeys.map((j) => (
                <li key={j.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-1 truncate">{j.name}</div>
                    <div className="text-[11px] text-ink-3">
                      {TRIGGER_LABEL[j.trigger] ?? j.trigger} · {stepCounts.get(j.id) ?? 0} step{(stepCounts.get(j.id) ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span className="text-xs text-ink-2 w-28 text-right [font-variant-numeric:tabular-nums]">
                    {activeEnroll.get(j.id) ?? 0} enrolled
                  </span>
                  <span className={`text-[10px] uppercase tracking-wider w-16 text-right ${j.status === "active" ? "text-revenue" : "text-ink-3"}`}>
                    {j.status}
                  </span>
                  <JourneyActions id={j.id} status={j.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
