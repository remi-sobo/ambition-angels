import Greeting from "./Greeting";
import BriefingStrip from "./BriefingStrip";
import RoleViewShell, { type ViewKey } from "./overview/RoleViewShell";
import CeoCockpit from "./overview/CeoCockpit";
import OpsPanel from "./overview/OpsPanel";
import { getAdminUser } from "@/lib/admin/auth";
import { getMyDisplayName, firstName } from "@/lib/admin/profile";

// Command Center — two curated role views (CEO cockpit for Remi, Ops control
// panel for Shannon) behind a pill toggle. The view defaults to the logged-in
// person's own view; the pill peeks at the other. Each view is an arrangement
// of self-contained widget components (app/admin/_components/overview/*), so a
// future widget customizer is cheap.
//
// The "Needs you today" briefing stays a shared strip above the toggle through
// Phase 1; Phase 2/3 split it — fires into the CEO cockpit, the stale-data /
// hygiene items into the Ops panel where they're actionable.

export default async function CommandCenter() {
  const [user, displayName] = await Promise.all([getAdminUser(), getMyDisplayName()]);
  const defaultView: ViewKey = user === "shannon" ? "ops" : "ceo";
  const greetingName = displayName ? firstName(displayName) : "there";

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <Greeting name={greetingName} org="Ambition Angels" />
        <BriefingStrip />
        <RoleViewShell defaultView={defaultView} ceo={<CeoCockpit />} ops={<OpsPanel />} />
      </div>
    </div>
  );
}
