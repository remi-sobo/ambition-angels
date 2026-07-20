import Greeting from "./Greeting";
import RoleViewShell, { type ViewKey } from "./overview/RoleViewShell";
import CeoCockpit from "./overview/CeoCockpit";
import OpsPanel from "./overview/OpsPanel";
import { getAdminUser, getOrgContext } from "@/lib/admin/auth";
import { getMyDisplayName, firstName } from "@/lib/admin/profile";

// Command Center — two curated role views (CEO cockpit for Remi, Ops control
// panel for Shannon) behind a pill toggle, straight after the greeting. The
// view defaults to the logged-in person's own view; the pill peeks at the
// other. Each view is an arrangement of self-contained widget components
// (app/admin/_components/overview/*), so a future widget customizer is cheap.
//
// The former pre-cockpit stack (status line / "Act on runway" banner, My Week
// summon card, and the merged "Needs you today" briefing + action queue) was
// removed by request — the action queue still lives at /admin/queue and the
// briefing at /admin/briefing.

export default async function CommandCenter() {
  const [user, displayName, ctx] = await Promise.all([
    getAdminUser(),
    getMyDisplayName(),
    getOrgContext(),
  ]);
  const defaultView: ViewKey = user === "shannon" ? "ops" : "ceo";
  const greetingName = displayName ? firstName(displayName) : "there";
  const orgName = ctx?.orgName ?? "your organization";

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <Greeting name={greetingName} org={orgName} />
        <RoleViewShell defaultView={defaultView} ceo={<CeoCockpit />} ops={<OpsPanel />} />
      </div>
    </div>
  );
}
