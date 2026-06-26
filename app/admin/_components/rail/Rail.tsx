import { cookies } from "next/headers";
import RailShell from "./RailShell";
import AgendaShelf from "./AgendaShelf";
import NeedsYouShelf from "./NeedsYouShelf";
import WeekPulse from "./WeekPulse";
import CaptureDock from "./CaptureDock";
import CollapsedReedLauncher from "./CollapsedReedLauncher";

/**
 * The persistent BloomOS right rail: a collapsible shell hosting the Agenda
 * shelf (bound live to the agenda service), the Needs-you shelf, and the pinned
 * capture dock. On xl+ the rail also carries Reed — capture escalates to the
 * real Reed drawer, and a collapsed-state launcher summons it — so the "Ask
 * Reed" FAB stays mobile-only.
 */
export default function Rail({ reedEnabled }: { reedEnabled: boolean }) {
  const pref = cookies().get("bloomos_rail")?.value;
  const defaultOpen = pref !== "closed"; // default-open unless the user collapsed it

  return (
    <RailShell
      defaultOpen={defaultOpen}
      footer={<CaptureDock reedEnabled={reedEnabled} />}
      collapsedLauncher={<CollapsedReedLauncher />}
    >
      <AgendaShelf />
      <NeedsYouShelf />
      <WeekPulse />
    </RailShell>
  );
}
