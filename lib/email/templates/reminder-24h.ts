import type { Booking, MeetingType } from "../../database.types";
import {
  escapeHtml,
  formatDateLong,
  formatTimeRange,
  htmlShell,
  manageUrl,
} from "../format";

export function buildReminder24hEmail(args: {
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

  const subject = `Tomorrow: ${meetingType.name} with Remi`;

  const text = [
    `Hey ${firstName},`,
    ``,
    `Just a heads-up — we're on for tomorrow.`,
    ``,
    `${meetingType.name} · ${meetingType.duration_minutes} minutes`,
    `${date}`,
    `${time}`,
    ``,
    `Meet link: ${meet}`,
    ``,
    `Need to move it? ${manage}`,
    ``,
    `— Remi`,
  ].join("\n");

  const html = htmlShell(`
    <tr><td style="padding-bottom:6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#E8500A;font-weight:700;">Heads up · 24 hours out</td></tr>
    <tr><td style="padding-bottom:20px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#0E0E0E;">Tomorrow.</td></tr>
    <tr><td style="padding-bottom:16px;">Hey ${escapeHtml(firstName)} — quick reminder we&rsquo;re on.</td></tr>
    <tr><td style="padding:16px 18px;background:#FAFAF8;border-radius:14px;border:1px solid #F0EEE8;">
      <div style="font-family:Georgia,serif;font-size:18px;color:#0E0E0E;margin-bottom:4px;">${escapeHtml(meetingType.name)} · ${meetingType.duration_minutes} min</div>
      <div style="color:#3D3D3D;">${escapeHtml(date)}</div>
      <div style="color:#3D3D3D;">${escapeHtml(time)}</div>
    </td></tr>
    <tr><td style="padding-top:20px;padding-bottom:16px;">
      <a href="${escapeHtml(meet)}" style="display:inline-block;background:#E8500A;color:#FFFFFF;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;">Join the Meet</a>
    </td></tr>
    <tr><td style="padding-bottom:8px;font-size:14px;color:#6B6960;">
      Need to move it? <a href="${escapeHtml(manage)}" style="color:#0E0E0E;text-decoration:underline;">Reschedule or cancel</a>.
    </td></tr>
    <tr><td style="padding-top:12px;color:#3D3D3D;">— Remi</td></tr>
  `);

  return { subject, text, html };
}
