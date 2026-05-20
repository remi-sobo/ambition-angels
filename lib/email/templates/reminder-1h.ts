import type { Booking, MeetingType } from "../../database.types";
import { escapeHtml, htmlShell } from "../format";

export function buildReminder1hEmail(args: {
  booking: Booking;
  meetingType: MeetingType;
}): { subject: string; text: string; html: string } {
  const { booking, meetingType } = args;
  const meet = booking.google_meet_url ?? "";
  const firstName = booking.attendee_name.split(" ")[0];

  const subject = `In an hour: ${meetingType.name} with Remi`;

  const text = [
    `Hey ${firstName},`,
    ``,
    `One hour out.`,
    ``,
    `Meet link: ${meet}`,
    ``,
    `— Remi`,
  ].join("\n");

  const html = htmlShell(`
    <tr><td style="padding-bottom:6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#E8500A;font-weight:700;">One hour out</td></tr>
    <tr><td style="padding-bottom:20px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#0E0E0E;">See you soon.</td></tr>
    <tr><td style="padding-bottom:20px;">Hey ${escapeHtml(firstName)} — one hour out.</td></tr>
    <tr><td style="padding-bottom:8px;">
      <a href="${escapeHtml(meet)}" style="display:inline-block;background:#E8500A;color:#FFFFFF;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px;">Join the Meet</a>
    </td></tr>
    <tr><td style="padding-top:18px;color:#3D3D3D;">— Remi</td></tr>
  `);

  return { subject, text, html };
}
