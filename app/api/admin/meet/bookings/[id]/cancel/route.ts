import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { cancelEvent } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { buildCancellationEmail } from "@/lib/email/templates/cancellation";
import type { Booking, MeetingType } from "@/lib/database.types";

const schema = z.object({
  reason: z.string().max(2000).optional(),
  notifyAttendee: z.boolean().optional().default(true),
});

/**
 * Admin-side cancellation. Same flow as the token-based cancel route, but
 * authed by admin cookie and looked up by booking ID. notifyAttendee
 * defaults to true; set false for silent cancellations (e.g. no-show
 * cleanup after the meeting time has passed).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown = {};
  try {
    if (req.headers.get("content-length") !== "0") body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, meeting_type:meeting_types(*)")
    .eq("id", params.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }
  const booking = data as Booking & { meeting_type: MeetingType };
  if (booking.status !== "confirmed") {
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  if (booking.google_event_id) {
    try {
      await cancelEvent(booking.google_event_id);
    } catch (err) {
      console.error("admin cancel: cancelEvent failed", err);
      return NextResponse.json(
        { error: "Could not cancel the calendar event." },
        { status: 502 }
      );
    }
  }

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: parsed.data.reason ?? "cancelled by admin",
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (parsed.data.notifyAttendee !== false) {
    const email = buildCancellationEmail({
      booking,
      meetingType: booking.meeting_type,
    });
    await sendEmail({
      to: booking.attendee_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }).catch((e) => console.error("admin cancel email failed", e));
  }

  return NextResponse.json({ success: true });
}
