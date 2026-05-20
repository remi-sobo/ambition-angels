import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAvailableSlots } from "@/lib/availability";
import type { MeetingType } from "@/lib/database.types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const dateStr = searchParams.get("date");
  const tz = searchParams.get("tz");
  const durationParam = searchParams.get("duration");

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
  const { data, error } = await supabase
    .from("meeting_types")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "meeting type not found" }, { status: 404 });
  }
  const meetingType = data as MeetingType;

  // Resolve effective duration: when duration_options is set, the caller
  // must pass a duration that's in the allow-list. Otherwise the type's
  // fixed duration_minutes is used.
  const effectiveDuration = resolveDuration(meetingType, durationParam);
  if (effectiveDuration instanceof Error) {
    return NextResponse.json({ error: effectiveDuration.message }, { status: 400 });
  }

  // Parse date as host-tz wall date by reading the YYYY-MM-DD components
  // directly; the availability lib re-anchors to HOST_TIMEZONE internally.
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC anchor; tz math happens in the lib

  try {
    const slots = await getAvailableSlots({
      meetingType: { ...meetingType, duration_minutes: effectiveDuration },
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

/**
 * Validates an optional duration param against a meeting type's options.
 * Returns the resolved duration (number) on success, an Error with a
 * user-safe message on validation failure.
 */
function resolveDuration(
  meetingType: MeetingType,
  raw: string | null
): number | Error {
  if (!meetingType.duration_options || meetingType.duration_options.length === 0) {
    // Fixed-duration type — ignore any param.
    return meetingType.duration_minutes;
  }
  if (!raw) return meetingType.duration_minutes; // fall back to default
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return new Error("invalid duration");
  }
  if (!meetingType.duration_options.includes(n)) {
    return new Error("duration not offered by this meeting type");
  }
  return n;
}
