import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

// Confirmed /meet bookings that could fulfil this connection — matched to the
// task's linked constituent by attendee email (case-insensitive). Feeds the
// "Mark booked" picker. Light + best-effort: no match just means Shannon marks
// it booked without a /meet link.

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: task } = await supabase
    .from("ops_tasks")
    .select("id, linked_entity_type, linked_entity_id")
    .eq("id", params.id)
    .maybeSingle();
  const t = task as { linked_entity_type: string | null; linked_entity_id: string | null } | null;
  if (!t || t.linked_entity_type !== "constituent" || !t.linked_entity_id) {
    return NextResponse.json({ bookings: [] });
  }

  const { data: con } = await supabase
    .from("constituents")
    .select("emails")
    .eq("id", t.linked_entity_id)
    .maybeSingle();
  const emails = ((con as { emails: string[] | null } | null)?.emails ?? []).filter(Boolean);
  if (emails.length === 0) return NextResponse.json({ bookings: [] });

  // ilike with a bare value = case-insensitive equality on each email.
  const or = emails.map((e) => `attendee_email.ilike.${e.replace(/[,()]/g, "")}`).join(",");
  const { data, error } = await supabase
    .from("bookings")
    .select("id, attendee_name, attendee_email, start_time, meeting_type:meeting_types(name)")
    .eq("status", "confirmed")
    .or(or)
    .order("start_time", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[connections bookings GET]", error.message);
    return NextResponse.json({ bookings: [] });
  }

  const bookings = (
    (data ?? []) as unknown as Array<{
      id: string;
      attendee_name: string;
      attendee_email: string;
      start_time: string;
      meeting_type: { name: string } | null;
    }>
  ).map((b) => ({
    id: b.id,
    attendeeName: b.attendee_name,
    startTime: b.start_time,
    typeName: b.meeting_type?.name ?? "Meeting",
  }));

  return NextResponse.json({ bookings });
}
