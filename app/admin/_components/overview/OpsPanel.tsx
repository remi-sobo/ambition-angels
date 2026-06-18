import PrioritiesWidget from "./PrioritiesWidget";
import RecentDonationsWidget from "./RecentDonationsWidget";

// Ops control panel (Shannon). Answers: what's on my plate, who needs a
// thank-you, what needs scheduling, is the data clean, what's due, what do I
// chase.
//
// Phase 1 — first arrangement from widgets that already have data: the priority
// queue and recent gifts. Phase 3 builds the curated ops widgets (my queue,
// acks due, scheduling lane, data hygiene, deadlines+finance, follow-through),
// at which point the stale-data alert moves here as an actionable hygiene item.

export default function OpsPanel() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <PrioritiesWidget className="lg:col-span-6" />
        <RecentDonationsWidget className="lg:col-span-6" />
      </div>
    </div>
  );
}
