import type { Booking, MeetingType } from "../../database.types";
import {
  escapeHtml,
  formatDateLong,
  formatTimeRange,
  htmlShell,
} from "../format";

const HOST_TZ = "America/Los_Angeles";

/**
 * Internal notification sent to Remi for every new booking. Optimized for
 * fast scan: who, what, when, why. Voice is straight, not warm.
 */
export function buildInternalNotificationEmail(args: {
  booking: Booking;
  meetingType: MeetingType;
}): { subject: string; text: string; html: string } {
  const { booking, meetingType } = args;
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const dateHost = formatDateLong(start, HOST_TZ);
  const timeHost = formatTimeRange(start, end, HOST_TZ);
  const timeAttendee = formatTimeRange(start, end, booking.attendee_timezone);

  const subject = `New booking: ${meetingType.name} with ${booking.attendee_name} on ${dateHost.split(",").slice(0, 2).join(",")}`;

  const lines: Array<[string, string | null]> = [
    ["Type", `${meetingType.name} · ${meetingType.duration_minutes} min`],
    ["When (PT)", `${dateHost}, ${timeHost}`],
    ["When (attendee)", timeAttendee],
    ["Name", booking.attendee_name],
    ["Email", booking.attendee_email],
    ["Company", booking.attendee_company],
    ["Role", booking.attendee_role],
    ["Message", booking.attendee_message],
    ["Meet link", booking.google_meet_url],
  ];

  const text = lines
    .filter(([, v]) => v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const rows = lines
    .filter(([, v]) => v !== null && v !== "")
    .map(
      ([k, v]) => `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#6B6960;font-size:14px;vertical-align:top;width:130px;">${escapeHtml(k)}</td>
      <td style="padding:6px 0;color:#0E0E0E;font-size:14px;">${escapeHtml(v as string)}</td>
    </tr>`
    )
    .join("");

  const html = htmlShell(`
    <tr><td style="padding-bottom:16px;font-family:Georgia,serif;font-size:22px;color:#0E0E0E;">New booking</td></tr>
    <tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr>
  `);

  return { subject, text, html };
}
