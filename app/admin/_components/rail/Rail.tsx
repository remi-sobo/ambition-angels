import { cookies } from "next/headers";
import RailShell from "./RailShell";
import AgendaShelf from "./AgendaShelf";
import NeedsYouShelf from "./NeedsYouShelf";
import CaptureDock from "./CaptureDock";
import { ReedProvider } from "./reed/ReedProvider";
import CollapsedReedLauncher from "./reed/CollapsedReedLauncher";

/**
 * The persistent BloomOS right rail: a collapsible shell hosting the Agenda
 * shelf (bound live to the agenda service), the Needs-you shelf, and the pinned
 * capture dock. Reed (Phase 3) mounts beneath capture.
 */
export default function Rail() {
  const pref = cookies().get("bloomos_rail")?.value;
  const defaultOpen = pref !== "closed"; // default-open unless the user collapsed it

  return (
    // Reed isn't wired in this repo yet — `ready={false}` keeps the slot present
    // but inert (panel shows its warming-up state). The Reed build flips this.
    <ReedProvider ready={false}>
      <RailShell
        defaultOpen={defaultOpen}
        footer={<CaptureDock />}
        collapsedLauncher={<CollapsedReedLauncher />}
      >
        <AgendaShelf />
        <NeedsYouShelf />
      </RailShell>
    </ReedProvider>
  );
}
