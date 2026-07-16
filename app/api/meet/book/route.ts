import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAvailableSlots, HOST_TIMEZONE } from "@/lib/availability";
import { createEvent, cancelEvent } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { buildConfirmationEmail } from "@/lib/email/templates/confirmation";
import { buildInternalNotificationEmail } from "@/lib/email/templates/internal-notification";
import { bookSchema } from "@/lib/meet/schemas";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import type { Booking, LocationType, MeetingType } from "@/lib/database.types";

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
  const {
    meetingTypeSlug,
    startTime,
    attendeeTimezone,
    attendee,
    durationMinutes,
    locationType: locationTypeOverride,
    inPersonAddress,
  } = parsed.data;

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
  // Booking tenancy follows the meeting type's org (parent row), never the
  // column default — this is a public route with no session to read.
  const mtOrgId = (meetingType as Record<string, unknown>).org_id as string;

  // Resolve effective duration. When the type has duration_options, the
  // caller must pass durationMinutes and it must be in the allow-list.
  const effectiveDuration = resolveBookingDuration(mtRaw, durationMinutes);
  if (effectiveDuration instanceof Error) {
    return NextResponse.json({ error: effectiveDuration.message }, { status: 400 });
  }
  const mt: MeetingType = { ...mtRaw, duration_minutes: effectiveDuration };

  // Resolve location: video defaults to the static Zoom URL; in_person uses
  // the type's default address, or the attendee's suggestion if no default.
  const resolvedLocation = resolveBookingLocation(mt, {
    locationType: locationTypeOverride,
    inPersonAddress,
  });
  if (resolvedLocation instanceof Error) {
    return NextResponse.json({ error: resolvedLocation.message }, { status: 400 });
  }

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
    resolvedLocation.locationType === "video"
      ? `Zoom: ${resolvedLocation.meetingUrl}${
          process.env.ZOOM_PASSCODE ? `\nPasscode: ${process.env.ZOOM_PASSCODE}` : ""
        }`
      : `Where: ${resolvedLocation.locationDetails ?? "TBD"}`,
    attendee.message
      ? `What they want to discuss:\n${attendee.message}`
      : null,
    mt.prep_notes ? `Prep:\n${mt.prep_notes}` : null,
    attendee.company ? `Company: ${attendee.company}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Calendar event location field: Zoom URL for video, address for in-person.
  // This shows up as "Where" in the attendee's calendar invite.
  const eventLocation =
    resolvedLocation.locationType === "video"
      ? resolvedLocation.meetingUrl ?? undefined
      : resolvedLocation.locationDetails ?? undefined;

  let eventId: string;
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
      location: eventLocation,
    });
    eventId = created.eventId;
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
      org_id: mtOrgId,
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
      meeting_url: resolvedLocation.meetingUrl,
      location_type: resolvedLocation.locationType,
      location_details: resolvedLocation.locationDetails,
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

/**
 * Resolves the location for a new booking based on the meeting type's
 * configured options and the attendee's choices.
 *
 *   video    → meetingUrl is the static ZOOM_URL (snapshotted onto the row).
 *              locationDetails mirrors the URL for convenience.
 *   in_person→ meetingUrl is null. locationDetails is either the type's
 *              default_in_person_address, or the attendee's inPersonAddress
 *              suggestion when no default is set.
 *
 * Returns Error with a user-safe message on validation failure.
 */
function resolveBookingLocation(
  meetingType: MeetingType,
  input: { locationType?: LocationType; inPersonAddress?: string }
):
  | {
      locationType: LocationType;
      meetingUrl: string | null;
      locationDetails: string | null;
    }
  | Error {
  const options = meetingType.location_options ?? ["video"];
  let chosen: LocationType;

  if (options.length === 1) {
    chosen = options[0];
  } else {
    if (!input.locationType) {
      return new Error("Pick where you'd like to meet (video or in-person).");
    }
    if (!options.includes(input.locationType)) {
      return new Error("That location isn't offered for this meeting type.");
    }
    chosen = input.locationType;
  }

  if (chosen === "video") {
    const zoomUrl = process.env.ZOOM_URL;
    if (!zoomUrl) {
      return new Error("Video bookings aren't available right now.");
    }
    return {
      locationType: "video",
      meetingUrl: zoomUrl,
      locationDetails: zoomUrl,
    };
  }

  // in_person: prefer the type's default address, otherwise the attendee's
  // suggestion. Either may be null — that's fine, we'll surface "TBD" and
  // negotiate over email.
  const details =
    meetingType.default_in_person_address ?? input.inPersonAddress ?? null;
  return {
    locationType: "in_person",
    meetingUrl: null,
    locationDetails: details,
  };
}
