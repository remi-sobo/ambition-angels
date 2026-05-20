import type { Booking, MeetingType } from "../../database.types";
import {
  escapeHtml,
  formatDateLong,
  formatTimeRange,
  htmlShell,
  manageUrl,
} from "../format";

export function buildRescheduleConfirmationEmail(args: {
  booking: Booking;
  meetingType: MeetingType;
}): { subject: string; text: string; html: string } {
  const { booking, meetingType } = args;
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const tz = booking.attendee_timezone;
  const date = formatDateLong(start, tz);
  const time = formatTimeRange(start, end, tz);
  const meet = booking.google_meet_url ?? "";
  const manage = manageUrl(booking.cancel_token);
  const firstName = booking.attendee_name.split(" ")[0];

  const subject = `Rescheduled: ${meetingType.name} with Remi to ${date.split(",").slice(0, 2).join(",")}`;

  const text = [
    `Hey ${firstName},`,
    ``,
    `New time, locked in.`,
    ``,
    `${meetingType.name} · ${meetingType.duration_minutes} minutes`,
    `${date}`,
    `${time}`,
    ``,
    `Meet link: ${meet}`,
    ``,
    `Need to change it again? ${manage}`,
    ``,
    `See you then.`,
    ``,
    `— Remi`,
  ].join("\n");

  const html = htmlShell(`
    <tr><td style="padding-bottom:8px;font-size:14px;color:#6B6960;">Meet with Remi</td></tr>
    <tr><td style="padding-bottom:24px;font-family:Georgia,serif;font-size:32px;line-height:1.15;">New time, locked in.</td></tr>
    <tr><td style="padding-bottom:8px;">Hey ${escapeHtml(firstName)},</td></tr>
    <tr><td style="padding-bottom:20px;">Here's the updated booking.</td></tr>
    <tr><td style="padding:16px 18px;background:#FAFAF8;border-radius:14px;border:1px solid #F0EEE8;">
      <div style="font-family:Georgia,serif;font-size:18px;color:#0E0E0E;margin-bottom:4px;">${escapeHtml(meetingType.name)} · ${meetingType.duration_minutes} min</div>
      <div style="color:#3D3D3D;">${escapeHtml(date)}</div>
      <div style="color:#3D3D3D;">${escapeHtml(time)}</div>
    </td></tr>
    <tr><td style="padding-top:20px;padding-bottom:20px;">
      <a href="${escapeHtml(meet)}" style="display:inline-block;background:#E8500A;color:#FFFFFF;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;">Join the Meet</a>
    </td></tr>
    <tr><td style="padding-bottom:20px;font-size:14px;color:#6B6960;">
      Need to change it again? <a href="${escapeHtml(manage)}" style="color:#0E0E0E;text-decoration:underline;">Manage your booking</a>.
    </td></tr>
    <tr><td>See you then.</td></tr>
    <tr><td style="padding-top:4px;color:#3D3D3D;">— Remi</td></tr>
  `);

  return { subject, text, html };
}
