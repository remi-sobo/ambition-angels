import type { Booking, MeetingType } from "../../database.types";
import {
  escapeHtml,
  formatDateLong,
  formatTimeRange,
  htmlShell,
  manageUrl,
} from "../format";

export function buildConfirmationEmail(args: {
  booking: Booking;
  meetingType: MeetingType;
}): { subject: string; text: string; html: string } {
  const { booking, meetingType } = args;
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  const tz = booking.attendee_timezone;
  const date = formatDateLong(start, tz);
  const time = formatTimeRange(start, end, tz);
  const manage = manageUrl(booking.cancel_token);
  const firstName = booking.attendee_name.split(" ")[0];
  const isVideo = booking.location_type === "video";
  const meetingUrl = booking.meeting_url ?? "";
  const address = booking.location_details ?? "Address TBD — I'll be in touch.";
  const passcode = process.env.ZOOM_PASSCODE;

  const subject = `You're booked: ${meetingType.name} with Remi on ${formatDateLong(start, tz).split(",").slice(0, 2).join(",")}`;

  const locationLines: string[] = isVideo
    ? [`Zoom: ${meetingUrl}`, passcode ? `Passcode: ${passcode}` : ""]
    : [`Where: ${address}`];

  const text = [
    `Hey ${firstName},`,
    ``,
    `You're booked.`,
    ``,
    `${meetingType.name} · ${meetingType.duration_minutes} minutes`,
    `${date}`,
    `${time}`,
    ``,
    ...locationLines.filter(Boolean),
    meetingType.prep_notes ? `\nPrep: ${meetingType.prep_notes}` : null,
    ``,
    `Need to reschedule or cancel? ${manage}`,
    ``,
    `I'll show up ready.`,
    ``,
    `— Remi`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const locationBlock = isVideo
    ? `<tr><td style="padding-top:20px;padding-bottom:8px;">
        <a href="${escapeHtml(meetingUrl)}" style="display:inline-block;background:#E8500A;color:#FFFFFF;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;">Join Zoom</a>
      </td></tr>
      ${
        passcode
          ? `<tr><td style="padding-bottom:20px;font-size:13px;color:#6B6960;">Passcode: <span style="color:#0E0E0E;font-weight:600;">${escapeHtml(passcode)}</span></td></tr>`
          : `<tr><td style="padding-bottom:20px;font-size:13px;color:#6B6960;">${escapeHtml(meetingUrl)}</td></tr>`
      }`
    : `<tr><td style="padding-top:20px;padding-bottom:20px;">
        <div style="background:#FAFAF8;border:1px solid #F0EEE8;border-radius:14px;padding:14px 16px;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B6960;font-weight:700;margin-bottom:4px;">Where</div>
          <div style="color:#0E0E0E;">${escapeHtml(address)}</div>
        </div>
      </td></tr>`;

  const html = htmlShell(`
    <tr><td style="padding-bottom:6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#E8500A;font-weight:700;">Booked with Remi</td></tr>
    <tr><td style="padding-bottom:24px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.15;color:#0E0E0E;">You're booked.</td></tr>
    <tr><td style="padding-bottom:8px;">Hey ${escapeHtml(firstName)},</td></tr>
    <tr><td style="padding-bottom:20px;">Here's what's on the books.</td></tr>
    <tr><td style="padding:16px 18px;background:#FAFAF8;border-radius:14px;border:1px solid #F0EEE8;margin-bottom:20px;">
      <div style="font-family:Georgia,serif;font-size:18px;color:#0E0E0E;margin-bottom:4px;">${escapeHtml(meetingType.name)} · ${meetingType.duration_minutes} min</div>
      <div style="color:#3D3D3D;">${escapeHtml(date)}</div>
      <div style="color:#3D3D3D;">${escapeHtml(time)}</div>
    </td></tr>
    ${locationBlock}
    ${
      meetingType.prep_notes
        ? `<tr><td style="padding-bottom:20px;color:#3D3D3D;"><strong style="color:#0E0E0E;">Prep:</strong> ${escapeHtml(meetingType.prep_notes)}</td></tr>`
        : ""
    }
    <tr><td style="padding-bottom:20px;font-size:14px;color:#6B6960;">
      Something change? <a href="${escapeHtml(manage)}" style="color:#0E0E0E;text-decoration:underline;">Reschedule or cancel</a>.
    </td></tr>
    <tr><td style="padding-top:8px;padding-bottom:0;">I'll show up ready.</td></tr>
    <tr><td style="padding-top:4px;color:#3D3D3D;">— Remi</td></tr>
  `);

  return { subject, text, html };
}
