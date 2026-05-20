import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Booking, MeetingType } from "@/lib/database.types";

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
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  const { meeting_type, ...booking } = data as Booking & {
    meeting_type: MeetingType;
  };
  return NextResponse.json({ booking, meetingType: meeting_type });
}
