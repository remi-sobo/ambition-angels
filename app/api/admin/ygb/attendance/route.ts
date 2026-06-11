import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// GET /api/admin/ygb/attendance?date=YYYY-MM-DD → rows for that day
export async function GET(req: NextRequest) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!isDate(date)) {
    return NextResponse.json({ error: "A valid ?date=YYYY-MM-DD is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ygb_attendance")
    .select("registration_id,checked_in")
    .eq("attendance_date", date);

  if (error) {
    console.error("YGB attendance GET error:", error);
    return NextResponse.json({ error: "Failed to load attendance" }, { status: 500 });
  }

  return NextResponse.json({ attendance: data ?? [] });
}

// POST /api/admin/ygb/attendance → upsert a check-in for (registration, date)
export async function POST(req: NextRequest) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const registration_id = typeof body?.registration_id === "string" ? body.registration_id : "";
  const attendance_date = typeof body?.attendance_date === "string" ? body.attendance_date : "";
  const checked_in = body?.checked_in === true;

  if (!registration_id || !isDate(attendance_date)) {
    return NextResponse.json({ error: "registration_id and a valid attendance_date are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("ygb_attendance")
    .upsert(
      {
        registration_id,
        attendance_date,
        checked_in,
        check_in_time: checked_in ? new Date().toISOString() : null,
      },
      { onConflict: "registration_id,attendance_date" }
    );

  if (error) {
    console.error("YGB attendance POST error:", error);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
