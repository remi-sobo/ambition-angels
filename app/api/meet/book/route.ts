import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAvailableSlots, HOST_TIMEZONE } from "@/lib/availability";
import { createEvent, cancelEvent } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { buildConfirmationEmail } from "@/lib/email/templates/confirmation";
import { buildInternalNotificationEmail } from "@/lib/email/templates/internal-notification";
import { bookSchema } from "@/lib/meet/schemas";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import type { Booking, MeetingType } from "@/lib/database.types";

const HOST_EMAIL = "remi@ambitionangels.org";

// 3 booking attempts per IP per 10 minutes. Per-instance in-memory; see
// lib/rate-limit.ts for caveats. Generous on purpose — real users may
// abandon and retry; we just want to stop trivial spam.
const RATE_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit(`book:${ip}`, RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many booking attempts. Try again in a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString() },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { meetingTypeSlug, startTime, attendeeTimezone, attendee, durationMinutes } = parsed.data;

  const supabase = getSupabaseAdmin();

  const { data: meetingType, error: lookupErr } = await supabase
    .from("meeting_types")
    .select("*")
    .eq("slug", meetingTypeSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!meetingType) {
    return NextResponse.json({ error: "meeting type not found" }, { status: 404 });
  }
  const mtRaw = meetingType as MeetingType;

  // Resolve effective duration. When the type has duration_options, the
  // caller must pass durationMinutes and it must be in the allow-list.
  const effectiveDuration = resolveBookingDuration(mtRaw, durationMinutes);
  if (effectiveDuration instanceof Error) {
    return NextResponse.json({ error: effectiveDuration.message }, { status: 400 });
  }
  const mt: MeetingType = { ...mtRaw, duration_minutes: effectiveDuration };

  const start = new Date(startTime);
  const end = new Date(start.getTime() + mt.duration_minutes * 60_000);

  // Re-check availability server-side — do not trust the client.
  const slots = await getAvailableSlots({
    meetingType: mt,
    date: start,
    attendeeTimezone,
  });
  const requestedMs = start.getTime();
  if (!slots.some((s) => s.start.getTime() === requestedMs)) {
    return NextResponse.json(
      { error: "That slot is no longer available." },
      { status: 409 }
    );
  }

  // 1) Create the Google Calendar event (with Meet link). If this throws,
  //    nothing is persisted yet — return 500 cleanly.
  //
  //    Event title format: "Ambition Angels [Type] meeting w/ [Name] - [Org]".
  //    Drop the trailing " - [Org]" entirely when no organization was given.
  const summary = attendee.company
    ? `Ambition Angels ${mt.name} meeting w/ ${attendee.name} - ${attendee.company}`
    : `Ambition Angels ${mt.name} meeting w/ ${attendee.name}`;
  const description = [
    attendee.message
      ? `What they want to discuss:\n${attendee.message}`
      : null,
    mt.prep_notes ? `Prep:\n${mt.prep_notes}` : null,
    attendee.company ? `Company: ${attendee.company}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  let eventId: string;
  let meetLink: string;
  try {
    const created = await createEvent({
      summary,
      description,
      start,
      end,
      timeZone: HOST_TIMEZONE,
      attendees: [
        { email: HOST_EMAIL, displayName: "Remi Sobo" },
        { email: attendee.email, displayName: attendee.name },
      ],
    });
    eventId = created.eventId;
    meetLink = created.meetLink;
  } catch (err) {
    console.error("createEvent failed", err);
    return NextResponse.json(
      { error: "Could not create the calendar event. Try again in a moment." },
      { status: 502 }
    );
  }

  // 2) Insert the Supabase row. If this fails (uniq_bookings_confirmed_start
  //    on race, or any other DB error), cancel the Google event we just
  //    created so nothing is orphaned.
  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      meeting_type_id: mt.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      attendee_timezone: attendeeTimezone,
      attendee_name: attendee.name,
      attendee_email: attendee.email,
      attendee_company: attendee.company ?? null,
      attendee_role: attendee.role ?? null,
      attendee_message: attendee.message ?? null,
      google_event_id: eventId,
      google_meet_url: meetLink,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    console.error("booking insert failed, cancelling event", insertErr);
    try {
      await cancelEvent(eventId);
    } catch (cancelErr) {
      console.error("compensating cancelEvent failed", cancelErr);
    }
    const isRace = insertErr?.code === "23505";
    return NextResponse.json(
      { error: isRace
          ? "Someone else just grabbed that slot. Pick another."
          : "Could not save the booking. Try again." },
      { status: isRace ? 409 : 500 }
    );
  }

  const booking = inserted as Booking;

  // 3) Emails. Each one tries independently; failures are logged but do
  //    not roll back the booking — the calendar invite already carries
  //    the same info as the confirmation email.
  const confirmation = buildConfirmationEmail({ booking, meetingType: mt });
  const internal = buildInternalNotificationEmail({ booking, meetingType: mt });

  await Promise.allSettled([
    sendEmail({
      to: booking.attendee_email,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
    }).catch((e) => console.error("confirmation email failed", e)),
    sendEmail({
      to: HOST_EMAIL,
      subject: internal.subject,
      html: internal.html,
      text: internal.text,
      replyTo: booking.attendee_email,
    }).catch((e) => console.error("internal email failed", e)),
  ]);

  return NextResponse.json({
    success: true,
    bookingId: booking.id,
    cancelToken: booking.cancel_token,
  });
}

/**
 * Validates an optional durationMinutes against a meeting type. For
 * fixed-duration types the override is ignored. For types with
 * duration_options, the override is required and must be in the list.
 * Returns the resolved duration on success, an Error with a user-safe
 * message on validation failure.
 */
function resolveBookingDuration(
  meetingType: MeetingType,
  override: number | undefined
): number | Error {
  if (!meetingType.duration_options || meetingType.duration_options.length === 0) {
    return meetingType.duration_minutes;
  }
  if (override == null) {
    return new Error("Pick a duration for this meeting type.");
  }
  if (!meetingType.duration_options.includes(override)) {
    return new Error("That duration isn't offered for this meeting type.");
  }
  return override;
}
