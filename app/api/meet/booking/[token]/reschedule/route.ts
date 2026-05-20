import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAvailableSlots, HOST_TIMEZONE } from "@/lib/availability";
import { updateEvent } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { buildRescheduleConfirmationEmail } from "@/lib/email/templates/reschedule-confirmation";
import { rescheduleSchema } from "@/lib/meet/schemas";
import type { Booking, MeetingType } from "@/lib/database.types";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: existing, error: lookupErr } = await supabase
    .from("bookings")
    .select("*, meeting_type:meeting_types(*)")
    .eq("cancel_token", params.token)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }
  const booking = existing as Booking & { meeting_type: MeetingType };
  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "This booking can no longer be changed." },
      { status: 409 }
    );
  }

  const newStart = new Date(parsed.data.newStartTime);
  const newEnd = new Date(
    newStart.getTime() + booking.meeting_type.duration_minutes * 60_000
  );

  // Re-check availability for the new slot.
  const slots = await getAvailableSlots({
    meetingType: booking.meeting_type,
    date: newStart,
    attendeeTimezone: booking.attendee_timezone,
  });
  if (!slots.some((s) => s.start.getTime() === newStart.getTime())) {
    return NextResponse.json(
      { error: "That slot is no longer available." },
      { status: 409 }
    );
  }

  if (!booking.google_event_id) {
    return NextResponse.json(
      { error: "Booking has no calendar event; cannot reschedule." },
      { status: 500 }
    );
  }

  // Update Google Calendar first; if that fails, leave the DB row alone.
  try {
    await updateEvent(booking.google_event_id, newStart, newEnd, HOST_TIMEZONE);
  } catch (err) {
    console.error("updateEvent failed", err);
    return NextResponse.json(
      { error: "Could not update the calendar event. Try again." },
      { status: 502 }
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("bookings")
    .update({
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .select("*")
    .single();

  if (updateErr || !updated) {
    console.error("booking update failed after google update", updateErr);
    return NextResponse.json(
      { error: "Calendar updated but DB record failed to save. Reach out." },
      { status: 500 }
    );
  }

  const next = { ...(updated as Booking) };
  const email = buildRescheduleConfirmationEmail({
    booking: next,
    meetingType: booking.meeting_type,
  });
  await sendEmail({
    to: next.attendee_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  }).catch((e) => console.error("reschedule email failed", e));

  return NextResponse.json({ success: true });
}
