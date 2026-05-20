import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildIcs } from "@/lib/meet/ics";
import type { Booking, MeetingType } from "@/lib/database.types";

/**
 * Returns an .ics calendar file for the booking identified by cancel_token.
 * Token-gated (same as the manage page). Cancelled bookings still return
 * an ICS with STATUS:CONFIRMED — calendar apps will already show the
 * Google invite cancellation; this download is for users who want to
 * re-add to a non-Google calendar.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, meeting_type:meeting_types(*)")
    .eq("cancel_token", params.token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { meeting_type, ...booking } = data as Booking & {
    meeting_type: MeetingType;
  };
  const ics = buildIcs({ booking: booking as Booking, meetingType: meeting_type });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="ambition-angels-${booking.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
