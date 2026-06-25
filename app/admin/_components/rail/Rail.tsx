import { cookies } from "next/headers";
import RailShell from "./RailShell";
import AgendaShelf from "./AgendaShelf";
import NeedsYouShelf from "./NeedsYouShelf";

/**
 * The persistent BloomOS right rail (Phase 1): a collapsible shell hosting the
 * Agenda shelf (bound live to the agenda service) and the Needs-you shelf.
 * Capture (Phase 2) and Reed (Phase 3) mount beneath these.
 */
export default function Rail() {
  const pref = cookies().get("bloomos_rail")?.value;
  const defaultOpen = pref !== "closed"; // default-open unless the user collapsed it

  return (
    <RailShell defaultOpen={defaultOpen}>
      <AgendaShelf />
      <NeedsYouShelf />
    </RailShell>
  );
}
