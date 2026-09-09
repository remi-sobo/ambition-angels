import { redirect } from "next/navigation";
import { getBoardContext } from "@/lib/board/auth";
import { getAllMeetings } from "@/lib/board/data";

export const dynamic = "force-dynamic";

/**
 * "Meetings" in the top nav.
 *
 * It used to point straight at /board/archive, so clicking Meetings landed a
 * director in Past meetings — the one view she almost never wants. This
 * resolves the meeting she means instead: the live one, else the next one
 * coming, else the most recent. Only with no meetings at all does it fall
 * through to the archive.
 */
export default async function MeetingsIndex() {
  const ctx = await getBoardContext();
  if (!ctx) redirect("/board/signin");

  // getAllMeetings returns newest first.
  const meetings = await getAllMeetings(ctx.orgId);
  if (meetings.length === 0) redirect("/board/archive");

  const live = meetings.find((m) => m.status === "live");
  const upcoming = [...meetings].reverse().find((m) => m.status === "upcoming");
  redirect(`/board/meetings/${(live ?? upcoming ?? meetings[0]).id}`);
}
