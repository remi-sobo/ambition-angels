import type { Booking, MeetingType } from "../../database.types";
import { escapeHtml, htmlShell } from "../format";

export function buildCancellationEmail(args: {
  booking: Booking;
  meetingType: MeetingType;
}): { subject: string; text: string; html: string } {
  const { booking, meetingType } = args;
  const firstName = booking.attendee_name.split(" ")[0];
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ambitionangels.org";
  const meetHome = `${base.replace(/\/$/, "")}/meet`;

  const subject = `Cancelled: ${meetingType.name} with Remi`;

  const text = [
    `Hey ${firstName},`,
    ``,
    `Got it — ${meetingType.name.toLowerCase()} cancelled.`,
    ``,
    `If you want to rebook, the door's open: ${meetHome}`,
    ``,
    `— Remi`,
  ].join("\n");

  const html = htmlShell(`
    <tr><td style="padding-bottom:8px;font-size:14px;color:#6B6960;">Meet with Remi</td></tr>
    <tr><td style="padding-bottom:20px;font-family:Georgia,serif;font-size:28px;line-height:1.15;">Cancelled.</td></tr>
    <tr><td style="padding-bottom:16px;">Hey ${escapeHtml(firstName)},</td></tr>
    <tr><td style="padding-bottom:24px;">Got it — ${escapeHtml(meetingType.name.toLowerCase())} cancelled.</td></tr>
    <tr><td style="padding-bottom:24px;">
      <a href="${escapeHtml(meetHome)}" style="display:inline-block;background:#0E0E0E;color:#FFFFFF;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;">Rebook when you're ready</a>
    </td></tr>
    <tr><td style="color:#3D3D3D;">— Remi</td></tr>
  `);

  return { subject, text, html };
}
