import { getAgenda, getVisibleOwners, type Agenda } from "@/lib/agenda/service";
import { getDisplayNames } from "@/lib/admin/profile";
import { Widget } from "./shared";
import AgendaList, { type AgendaLane } from "./AgendaList";

// Today/week agenda for the Command Center. Reads the delegation-aware cache
// through the session client (RLS scopes it to the viewer's own calendar plus
// any delegated to them).
//
// mode="list"  → one merged, time-ordered list (CEO cockpit, briefing).
// mode="lanes" → one column per visible calendar (ops two-lane: Shannon + Remi).
export default async function TodayAgenda({
  className,
  mode = "list",
}: {
  className?: string;
  mode?: "list" | "lanes";
}) {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 3_600_000); // client trims to today onward
  const end = new Date(now.getTime() + 8 * 86_400_000);

  let agenda: Agenda;
  try {
    agenda = await getAgenda({ start, end });
  } catch {
    agenda = { items: [], timeZone: "America/Los_Angeles", syncedAt: null, ownerIds: [] };
  }

  // In lanes mode, columns are the viewer's visible calendars (self + grantors),
  // shown even when a calendar has no events yet (prompts connecting it).
  let lanes: AgendaLane[] | undefined;
  let names: Record<string, string> = {};
  if (mode === "lanes") {
    const owners = await getVisibleOwners().catch(() => agenda.ownerIds);
    const ids = owners.length ? owners : agenda.ownerIds;
    names = await getDisplayNames(ids);
    lanes = ids.map((id) => ({ userId: id, label: names[id] ?? "Me" }));
  } else if (agenda.ownerIds.length > 1) {
    names = await getDisplayNames(agenda.ownerIds);
  }

  const multiOwner = mode === "list" && agenda.ownerIds.length > 1;

  return (
    <Widget title="Agenda" href="/meet" hrefLabel="Scheduler" className={className}>
      <AgendaList
        items={agenda.items}
        timeZone={agenda.timeZone}
        syncedAt={agenda.syncedAt}
        names={names}
        multiOwner={multiOwner}
        lanes={lanes}
      />
    </Widget>
  );
}
