import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Blackout, Booking, MeetingType } from "@/lib/database.types";
import { SCHEDULING_LABEL, type OpsTask } from "@/app/admin/ops/_types/ops";
import MeetAdmin from "./MeetAdmin";

export const dynamic = "force-dynamic";

type BookingWithType = Booking & { meeting_type: MeetingType };

async function fetchAll() {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const [typesRes, upcomingRes, recentRes, blackoutsRes, statsRes, connectionsRes] = await Promise.all([
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
  ]);

  return {
    types: (typesRes.data ?? []) as MeetingType[],
    upcoming: (upcomingRes.data ?? []) as BookingWithType[],
    recent: (recentRes.data ?? []) as BookingWithType[],
    blackouts: (blackoutsRes.data ?? []) as Blackout[],
    last30Count: statsRes.count ?? 0,
    connections: (connectionsRes.data ?? []) as OpsTask[],
  };
}

export default async function MeetAdminPage() {
  const data = await fetchAll();
  return <MeetAdmin initial={data} />;
}
