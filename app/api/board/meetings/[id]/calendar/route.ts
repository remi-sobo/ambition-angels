import { NextResponse } from "next/server";
import { getBoardContext } from "@/lib/board/auth";
import { getMeeting } from "@/lib/board/data";

/** RFC 5545 escaping: commas, semicolons, backslashes and newlines. */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC stamp: 20260909T230000Z */
function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * "Add to calendar" as an .ics download.
 *
 * A file rather than a Google Calendar deep link: half this board is not on
 * Google, and an .ics works in Outlook, Apple Calendar and Google alike.
 * Times are absolute UTC stamps, so a director in another timezone gets the
 * right hour rather than the right wall-clock number.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meeting = await getMeeting(ctx.orgId, params.id);
  if (!meeting?.starts_at) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const end = meeting.ends_at ?? new Date(new Date(meeting.starts_at).getTime() + 90 * 60_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ambition Angels//Board Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:board-${meeting.id}@ambitionangels.org`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(meeting.starts_at)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Ambition Angels — ${meeting.title}`)}`,
    `LOCATION:${esc(meeting.location ?? "Zoom")}`,
    `DESCRIPTION:${esc(
      [
        meeting.zoom_url ? `Join: ${meeting.zoom_url}` : null,
        meeting.zoom_room ? `Zoom room ${meeting.zoom_room}` : null,
        `Quorum is ${meeting.quorum_required} of 5 directors.`,
        "Agenda and materials: ambitionangels.org/board",
      ]
        .filter(Boolean)
        .join("\n"),
    )}`,
    meeting.zoom_url ? `URL:${meeting.zoom_url}` : null,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Ambition Angels board meeting in one hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  // CRLF line endings: RFC 5545 requires them and Outlook enforces it.
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="ambition-angels-board-${meeting.meeting_date}.ics"`,
    },
  });
}
