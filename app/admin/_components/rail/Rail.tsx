import { cookies } from "next/headers";
import RailShell from "./RailShell";
import AgendaShelf from "./AgendaShelf";
import NeedsYouShelf from "./NeedsYouShelf";
import CaptureBox from "./CaptureBox";

/**
 * The persistent BloomOS right rail: a collapsible shell hosting the Agenda
 * shelf (bound live to the agenda service), the Needs-you shelf, and the pinned
 * capture dock. Reed (Phase 3) mounts beneath capture.
 */
export default function Rail() {
  const pref = cookies().get("bloomos_rail")?.value;
  const defaultOpen = pref !== "closed"; // default-open unless the user collapsed it

  return (
    <RailShell defaultOpen={defaultOpen} footer={<CaptureBox />}>
      <AgendaShelf />
      <NeedsYouShelf />
    </RailShell>
  );
}
