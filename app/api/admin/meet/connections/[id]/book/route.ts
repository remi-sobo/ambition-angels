import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";

// Mark a connection booked (Phase 5 — close the loop). "Booked" is a status
// outcome: the task goes to done. Optionally link the /meet booking that
// fulfilled it (ops_tasks.booking_id) and write a 'meeting' interaction on the
// linked constituent so the meeting shows on their timeline. The interaction is
// keyed (external_source='meet', external_id=booking) so re-marking is
// idempotent.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { booking_id?: unknown } | null;
  const bookingId =
    typeof body?.booking_id === "string" && /^[0-9a-f-]{36}$/i.test(body.booking_id)
      ? body.booking_id
      : null;
  if (body?.booking_id != null && bookingId == null) {
    return NextResponse.json({ error: "booking_id must be a uuid" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: task } = await supabase
    .from("ops_tasks")
    .select("id, linked_entity_type, linked_entity_id")
    .eq("id", params.id)
    .maybeSingle();
  const t = task as
    | { id: string; linked_entity_type: string | null; linked_entity_id: string | null }
    | null;
  if (!t) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const { error: updErr } = await supabase
    .from("ops_tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      booking_id: bookingId,
    })
    .eq("id", t.id);
  if (updErr) {
    console.error("[connections book] task update:", updErr.message);
    return NextResponse.json({ error: "Failed to mark booked" }, { status: 500 });
  }

  // Surface the meeting on the constituent timeline when a booking is linked.
  if (bookingId && t.linked_entity_type === "constituent" && t.linked_entity_id) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("start_time, attendee_name, attendee_message, meeting_type:meeting_types(name)")
      .eq("id", bookingId)
      .maybeSingle();
    const b = booking as
      | {
          start_time: string;
          attendee_name: string | null;
          attendee_message: string | null;
          meeting_type: { name: string } | null;
        }
      | null;
    if (b) {
      const typeName = b.meeting_type?.name ?? "Meeting";
      const { error: intErr } = await supabase.from("interactions").upsert(
        {
          constituent_id: t.linked_entity_id,
          kind: "meeting",
          occurred_at: b.start_time,
          subject: `Booked: ${typeName}`,
          notes: b.attendee_message ?? null,
          logged_by: "meet",
          external_source: "meet",
          external_id: bookingId,
          is_private: false,
        },
        { onConflict: "external_source,external_id,constituent_id", ignoreDuplicates: true }
      );
      if (intErr) {
        // The task is booked regardless; the timeline entry is best-effort.
        console.error("[connections book] interaction upsert:", intErr.message);
      }
    }
  }

  return NextResponse.json({ status: "booked", booking_id: bookingId });
}
