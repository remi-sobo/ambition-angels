import type { AgendaItem } from "@/lib/agenda/service";

/**
 * Which agenda items count as the owner's own meetings (Weekly Plan v2,
 * PR 1). getAgenda() returns every calendar RLS lets the viewer read: their
 * own, any delegated to them, and their direct reports'. A week read must
 * keep only the viewed owner's events, or a manager's status line counts a
 * report's meetings as their own.
 *
 * Pure, so the week grid and the rhythm status line share one rule and it is
 * unit-tested (tests/own-events.test.ts).
 *
 * - Owner match: the event's owner_user_id is the viewed owner.
 * - Bookings (/meet) carry no owner: they belong on the viewer's own week,
 *   never superimposed on someone else's.
 * - source='bloomos' rows are mirrors of work blocks; blocks are counted from
 *   work_blocks, so the mirror is never a meeting.
 */
export function isOwnMeeting(
  item: Pick<AgendaItem, "ownerUserId" | "source">,
  ownerUserId: string,
  isSelf: boolean
): boolean {
  if (item.source === "bloomos") return false;
  return item.ownerUserId === ownerUserId || (item.ownerUserId === null && isSelf);
}
