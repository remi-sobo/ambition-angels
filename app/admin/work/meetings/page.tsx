import MeetingsPage from "@/app/admin/meetings/page";
import ConnectionsSection from "@/app/admin/meetings/connections/ConnectionsSection";

// Spec Work W3 — Meetings absorbs the connections pipeline (decision 3,
// resolved: the R2 addendum binds connection_candidates to Work → Meetings,
// and the queue is workflow, not settings). Composition: the V1 meetings
// screen (upcoming + past, unmodified) → the embedded connections pipeline.
// The candidates stay OUT of v_obligations (Spec A's Contract 3 ruling).
// /admin/meetings/connections stays byte-identical until its W4 308.
export const dynamic = "force-dynamic";

export default async function WorkMeetingsPage() {
  return (
    <>
      <MeetingsPage />
      <ConnectionsSection embedded />
    </>
  );
}
