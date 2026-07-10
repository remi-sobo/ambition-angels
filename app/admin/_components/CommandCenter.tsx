import Greeting from "./Greeting";
import NeedsYouToday from "./NeedsYouToday";
import StatusLineCard from "./StatusLineCard";
import MyWeekCard from "./overview/MyWeekCard";
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
// "Needs you today" (NeedsYouToday) is the ONE list of what needs a human:
// briefing signal cards on top, the v_action_items queue below in expandable
// per-module groups. It absorbed the former BriefingStrip + NeedsYouQueue
// pair, which stacked two overlapping lists.

export default async function CommandCenter() {
  const [user, displayName] = await Promise.all([getAdminUser(), getMyDisplayName()]);
  const defaultView: ViewKey = user === "shannon" ? "ops" : "ceo";
  const greetingName = displayName ? firstName(displayName) : "there";

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <Greeting name={greetingName} org="Ambition Angels" />
        <StatusLineCard />
        <MyWeekCard />
        <NeedsYouToday />
        <RoleViewShell defaultView={defaultView} ceo={<CeoCockpit />} ops={<OpsPanel />} />
      </div>
    </div>
  );
}
