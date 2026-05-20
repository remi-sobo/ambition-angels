import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAvailableSlots } from "@/lib/availability";
import type { MeetingType } from "@/lib/database.types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const dateStr = searchParams.get("date");
  const tz = searchParams.get("tz");

  if (!slug || !dateStr || !tz) {
    return NextResponse.json(
      { error: "slug, date, and tz are required" },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: meetingType, error } = await supabase
    .from("meeting_types")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!meetingType) {
    return NextResponse.json({ error: "meeting type not found" }, { status: 404 });
  }

  // Parse date as host-tz wall date by reading the YYYY-MM-DD components
  // directly; the availability lib re-anchors to HOST_TIMEZONE internally.
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC anchor; tz math happens in the lib

  try {
    const slots = await getAvailableSlots({
      meetingType: meetingType as MeetingType,
      date,
      attendeeTimezone: tz,
    });
    return NextResponse.json({
      slots: slots.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      })),
    });
  } catch (err) {
    console.error("availability error", err);
    return NextResponse.json(
      { error: "Could not load availability" },
      { status: 500 }
    );
  }
}
