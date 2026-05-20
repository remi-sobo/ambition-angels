import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cancelEvent } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { buildCancellationEmail } from "@/lib/email/templates/cancellation";
import { cancelSchema } from "@/lib/meet/schemas";
import type { Booking, MeetingType } from "@/lib/database.types";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  let body: unknown = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = await req.json();
    }
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error: lookupErr } = await supabase
    .from("bookings")
    .select("*, meeting_type:meeting_types(*)")
    .eq("cancel_token", params.token)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }
  const booking = data as Booking & { meeting_type: MeetingType };
  if (booking.status !== "confirmed") {
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  // Cancel the Google event first; cancelEvent is idempotent on 404/410.
  if (booking.google_event_id) {
    try {
      await cancelEvent(booking.google_event_id);
    } catch (err) {
      console.error("cancelEvent failed", err);
      return NextResponse.json(
        { error: "Could not cancel the calendar event. Try again." },
        { status: 502 }
      );
    }
  }

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: parsed.data.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id);

  if (updateErr) {
    console.error("booking cancel update failed", updateErr);
    return NextResponse.json(
      { error: "Calendar cancelled but DB record failed to update." },
      { status: 500 }
    );
  }

  const email = buildCancellationEmail({
    booking,
    meetingType: booking.meeting_type,
  });
  await sendEmail({
    to: booking.attendee_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  }).catch((e) => console.error("cancellation email failed", e));

  return NextResponse.json({ success: true });
}
