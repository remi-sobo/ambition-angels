import { getAgenda, type Agenda } from "@/lib/agenda/service";
import RailAgenda from "./RailAgenda";

/**
 * Agenda shelf for the right rail. Binds live to the delegation-aware agenda
 * service (session client + RLS) — up next, then the rest of today. The compact
 * render + sync tick live in the client RailAgenda.
 */
export default async function AgendaShelf() {
  const now = new Date();
  const start = new Date(now.getTime() - 12 * 3_600_000); // client trims to now onward
  const end = new Date(now.getTime() + 8 * 86_400_000);

  let agenda: Agenda;
  try {
    agenda = await getAgenda({ start, end });
  } catch {
    agenda = { items: [], timeZone: "America/Los_Angeles", syncedAt: null, ownerIds: [] };
  }

  return (
    <RailAgenda items={agenda.items} timeZone={agenda.timeZone} syncedAt={agenda.syncedAt} />
  );
}
