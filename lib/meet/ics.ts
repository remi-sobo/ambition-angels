import type { Booking, MeetingType } from "../database.types";

const HOST_EMAIL = "remi@ambitionangels.org";
const PRODID = "-//Ambition Angels//Meet//EN";

/**
 * Builds an RFC 5545 VEVENT for a booking. Returned as a string ready to be
 * served with Content-Type: text/calendar and Content-Disposition:
 * attachment. Lines are CRLF-terminated; values are escaped per the spec.
 *
 * Intentionally minimal — no recurrence, no alarms, no attachments. Calendar
 * apps generate their own reminders.
 */
export function buildIcs(args: {
  booking: Booking;
  meetingType: MeetingType;
}): string {
  const { booking, meetingType } = args;
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const meet = booking.google_meet_url ?? "";

  const description = [
    `${meetingType.name} with Remi.`,
    meet ? `Meet link: ${meet}` : null,
    meetingType.prep_notes ? `Prep: ${meetingType.prep_notes}` : null,
  ]
    .filter(Boolean)
    .join("\\n\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@ambitionangels.org`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escIcs(`${meetingType.name} with Remi`)}`,
    `DESCRIPTION:${description}`,
    meet ? `LOCATION:${escIcs(meet)}` : "",
    meet ? `URL:${escIcs(meet)}` : "",
    `ORGANIZER;CN=Remi Sobo:mailto:${HOST_EMAIL}`,
    `ATTENDEE;CN=${escIcs(booking.attendee_name)};RSVP=TRUE:mailto:${booking.attendee_email}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line) => line !== "");

  return lines.join("\r\n");
}

function formatIcsUtc(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escIcs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
