import { getAgenda, type Agenda } from "@/lib/agenda/service";
import { getDisplayNames } from "@/lib/admin/profile";
import { Widget } from "./shared";
import AgendaList from "./AgendaList";

// Today/week agenda for the Command Center. Reads the delegation-aware cache
// through the session client (RLS scopes it to the viewer's own calendar plus
// any delegated to them), so the same component serves the CEO cockpit (one
// calendar) and the ops two-lane view (Shannon's + Remi's).
export default async function TodayAgenda({ className }: { className?: string }) {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 3_600_000); // a little before today, client trims to today onward
  const end = new Date(now.getTime() + 8 * 86_400_000);

  let agenda: Agenda;
  try {
    agenda = await getAgenda({ start, end });
  } catch {
    agenda = { items: [], timeZone: "America/Los_Angeles", syncedAt: null, ownerIds: [] };
  }

  const multiOwner = agenda.ownerIds.length > 1;
  const names = multiOwner ? await getDisplayNames(agenda.ownerIds) : {};

  return (
    <Widget title="Agenda" href="/meet" hrefLabel="Scheduler" className={className}>
      <AgendaList
        items={agenda.items}
        timeZone={agenda.timeZone}
        syncedAt={agenda.syncedAt}
        names={names}
        multiOwner={multiOwner}
      />
    </Widget>
  );
}
