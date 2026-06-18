import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Blackout, Booking, MeetingType } from "@/lib/database.types";
import { SCHEDULING_LABEL, type OpsTask } from "@/app/admin/ops/_types/ops";
import { constituentName } from "@/lib/fundraising/display";
import type { Candidate } from "./CandidatesQueue";
import MeetAdmin from "./MeetAdmin";

export const dynamic = "force-dynamic";

type BookingWithType = Booking & { meeting_type: MeetingType };

async function fetchAll() {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const [
    typesRes,
    upcomingRes,
    recentRes,
    blackoutsRes,
    statsRes,
    connectionsRes,
    candidatesRes,
  ] = await Promise.all([
    supabase
      .from("meeting_types")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("bookings")
      .select("*, meeting_type:meeting_types(*)")
      .eq("status", "confirmed")
      .gte("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(100),
    supabase
      .from("bookings")
      .select("*, meeting_type:meeting_types(*)")
      .or(`status.eq.cancelled,and(status.eq.confirmed,start_time.lt.${nowIso})`)
      .order("start_time", { ascending: false })
      .limit(50),
    supabase
      .from("blackouts")
      .select("*")
      .order("start_date", { ascending: true }),
    supabase
      .from("bookings")
      .select("id, status, created_at, meeting_type_id", { count: "exact" })
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600_000).toISOString()),
    // Shannon's connection backlog: scheduling tasks assigned to her, in her
    // display_order (nulls last), oldest first as a stable tiebreak.
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("assigned_to", "shannon")
      .contains("labels", [SCHEDULING_LABEL])
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    // Pending email-detected candidates, newest first, with the reconciled
    // person for the card label.
    supabase
      .from("connection_candidates")
      .select(
        "id, thread_id, subject, constituent_id, " +
          "constituent:constituent_id(type, first_name, last_name, org_name)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const candidates: Candidate[] = (
    (candidatesRes.data ?? []) as unknown as Array<{
      id: string;
      thread_id: string;
      subject: string | null;
      constituent_id: string;
      constituent: {
        type: string;
        first_name: string | null;
        last_name: string | null;
        org_name: string | null;
      } | null;
    }>
  ).map((c) => ({
    id: c.id,
    threadId: c.thread_id,
    subject: c.subject,
    constituentId: c.constituent_id,
    personName: c.constituent ? constituentName(c.constituent) : "Unknown contact",
  }));

  return {
    types: (typesRes.data ?? []) as MeetingType[],
    upcoming: (upcomingRes.data ?? []) as BookingWithType[],
    recent: (recentRes.data ?? []) as BookingWithType[],
    blackouts: (blackoutsRes.data ?? []) as Blackout[],
    last30Count: statsRes.count ?? 0,
    connections: (connectionsRes.data ?? []) as OpsTask[],
    candidates,
  };
}

export default async function MeetAdminPage() {
  const data = await fetchAll();
  return <MeetAdmin initial={data} />;
}
