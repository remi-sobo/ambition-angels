import Greeting from "./Greeting";
import CeoCockpit from "./overview/CeoCockpit";
import { getOrgContext } from "@/lib/admin/auth";
import { getMyDisplayName, firstName } from "@/lib/admin/profile";

// Command Center — the greeting, then the principal's cockpit. The CEO/Ops pill
// toggle and the Ops Control panel were removed by request: everyone lands on
// one cockpit, org-scoped throughout, with its own to-dos scoped to the signed-
// in person and a per-org title (orgs.settings.cockpit_title — "CEO Cockpit"
// here, "Area Director" for a Young Life AD).
//
// The former pre-cockpit stack (status line / "Act on runway" banner, My Week
// summon card, and the merged "Needs you today" briefing + action queue) was
// removed earlier — the action queue still lives at /admin/queue and the
// briefing at /admin/briefing.

export default async function CommandCenter() {
  const [displayName, ctx] = await Promise.all([getMyDisplayName(), getOrgContext()]);
  const greetingName = displayName ? firstName(displayName) : "there";
  const orgName = ctx?.orgName ?? "your organization";

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <Greeting name={greetingName} org={orgName} />
        <CeoCockpit />
      </div>
    </div>
  );
}
