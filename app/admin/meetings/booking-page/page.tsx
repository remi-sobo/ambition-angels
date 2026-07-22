import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import type { Blackout, MeetingType } from "@/lib/database.types";
import PageHeader from "@/app/admin/_components/PageHeader";
import BookingPageSettings from "./BookingPageSettings";
import BookingHistory, { type BookingWithType } from "./BookingHistory";

export const dynamic = "force-dynamic";

// Setup for the public /meet scheduler: the bookable meeting types and the
// availability blackouts behind them, plus the history of what came through.
// Live upcoming bookings show in the Overview's Upcoming list.
async function fetchSetup(orgId: string) {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // Org fence: the service-role client bypasses RLS, so every read is scoped
  // to the active org.
  const [typesRes, blackoutsRes, historyRes, statsRes] = await Promise.all([
    supabase
      .from("meeting_types")
      .select("*")
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("blackouts")
      .select("*")
      .eq("org_id", orgId)
      .order("start_date", { ascending: true }),
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
    types: (typesRes.data ?? []) as MeetingType[],
    blackouts: (blackoutsRes.data ?? []) as Blackout[],
    history: (historyRes.data ?? []) as BookingWithType[],
    last30Count: statsRes.count ?? 0,
  };
}

export default async function BookingPagePage() {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const { types, blackouts, history, last30Count } = await fetchSetup(ctx.orgId);

  return (
    <div className="max-w-5xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <PageHeader
        title="Booking page"
        subtitle="The meeting types and availability behind your public scheduler."
        actions={
          <Link
            href="/meet"
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-orange hover:text-orange-dark border-[1.5px] border-outline hover:bg-[#EFE6D4] rounded-lg px-3.5 py-2 transition-colors"
          >
            View public page
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 3h7v7M13 3L7 9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 9.5V13H3V5h3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        }
      />
      <BookingPageSettings initialTypes={types} initialBlackouts={blackouts} />
      <BookingHistory rows={history} last30Count={last30Count} />
    </div>
  );
}
