import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Booking, MeetingType } from "@/lib/database.types";
import ManageBooking from "./manage-booking";

export const metadata: Metadata = {
  title: "Your Booking",
  robots: "noindex, nofollow",
};

async function fetchBookingByToken(token: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, meeting_type:meeting_types(*)")
    .eq("cancel_token", token)
    .maybeSingle();
  if (error) {
    console.error("Failed to fetch booking by token", error);
    return null;
  }
  return data as (Booking & { meeting_type: MeetingType }) | null;
}

export default async function ManagePage({
  params,
}: {
  params: { token: string };
}) {
  const row = await fetchBookingByToken(params.token);
  if (!row) notFound();
  const { meeting_type, ...booking } = row;
  return (
    <ManageBooking
      booking={booking as Booking}
      meetingType={meeting_type as MeetingType}
      token={params.token}
    />
  );
}
