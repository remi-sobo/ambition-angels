import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "@/app/admin/_components/PageHeader";
import BookingsAdmin, { type BookingWithType } from "./BookingsAdmin";

export const dynamic = "force-dynamic";

// Incoming bookings made through the public /meet page: what's on the books,
// what's past or cancelled, and the admin-side cancel action.
async function fetchBookings(orgId: string) {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // Org fence: the service-role client bypasses RLS, so every read is scoped
  // to the active org.
  const [upcomingRes, recentRes, statsRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("*, meeting_type:meeting_types(*)")
      .eq("org_id", orgId)
      .eq("status", "confirmed")
      .gte("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(100),
    supabase
      .from("bookings")
      .select("*, meeting_type:meeting_types(*)")
      .eq("org_id", orgId)
      .or(`status.eq.cancelled,and(status.eq.confirmed,start_time.lt.${nowIso})`)
      .order("start_time", { ascending: false })
      .limit(50),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600_000).toISOString()),
  ]);

  return {
    upcoming: (upcomingRes.data ?? []) as BookingWithType[],
    recent: (recentRes.data ?? []) as BookingWithType[],
    last30Count: statsRes.count ?? 0,
  };
}

export default async function BookingsPage() {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const data = await fetchBookings(ctx.orgId);

  return (
    <div className="max-w-5xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <PageHeader
        title="Bookings"
        subtitle="Meetings booked through your public booking page."
      />
      <BookingsAdmin
        initialUpcoming={data.upcoming}
        initialRecent={data.recent}
        last30Count={data.last30Count}
      />
    </div>
  );
}
