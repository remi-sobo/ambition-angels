/**
 * Renders each /meet email template against a fake booking and writes the
 * HTML to public/_email-previews/. Use to QA template changes locally:
 *   npx tsx scripts/render-emails.ts
 * Then visit /_email-previews/<name>.html in the dev server.
 *
 * The output dir is gitignored.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildConfirmationEmail } from "../lib/email/templates/confirmation";
import { buildInternalNotificationEmail } from "../lib/email/templates/internal-notification";
import { buildRescheduleConfirmationEmail } from "../lib/email/templates/reschedule-confirmation";
import { buildCancellationEmail } from "../lib/email/templates/cancellation";
import { buildReminder24hEmail } from "../lib/email/templates/reminder-24h";
import { buildReminder1hEmail } from "../lib/email/templates/reminder-1h";
import type { Booking, MeetingType } from "../lib/database.types";

const meetingType: MeetingType = {
  id: "fake-type-id",
  slug: "donor-conversation",
  name: "Donor Conversation",
  duration_minutes: 30,
  description: "For people thinking through where their giving belongs.",
  prep_notes: "Bring what you care about. We'll see if Ambition Angels fits.",
  who_its_for: "Philanthropists, family offices, individual donors.",
  color: "#2F5D7E",
  icon_name: "Heart",
  buffer_minutes: 15,
  min_notice_hours: 24,
  max_advance_days: 30,
  available_days: [1, 2, 3, 4, 5],
  available_start_time: "09:00:00",
  available_end_time: "17:00:00",
  daily_limit: null,
  is_active: true,
  sort_order: 2,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const booking: Booking = {
  id: "fake-booking-id",
  meeting_type_id: meetingType.id,
  start_time: "2026-05-28T17:00:00Z",
  end_time: "2026-05-28T17:30:00Z",
  attendee_timezone: "America/Los_Angeles",
  attendee_name: "Sam Rivera",
  attendee_email: "sam@example.com",
  attendee_company: "Foundation Co.",
  attendee_role: "Donor",
  attendee_message:
    "I run a small family foundation focused on youth opportunity and want to understand how Ambition Angels measures impact.",
  google_event_id: "fake-event-id",
  google_meet_url: "https://meet.google.com/abc-defg-hij",
  cancel_token: "fake-cancel-token-uuid-1234",
  status: "confirmed",
  cancelled_at: null,
  cancellation_reason: null,
  reminder_sent_24h: false,
  reminder_sent_1h: false,
  created_at: "2026-05-19T16:00:00Z",
  updated_at: "2026-05-19T16:00:00Z",
};

const outDir = join(process.cwd(), "public", "_email-previews");
mkdirSync(outDir, { recursive: true });

const templates = [
  ["confirmation", buildConfirmationEmail({ booking, meetingType })],
  ["internal-notification", buildInternalNotificationEmail({ booking, meetingType })],
  ["reschedule", buildRescheduleConfirmationEmail({ booking, meetingType })],
  ["cancellation", buildCancellationEmail({ booking, meetingType })],
  ["reminder-24h", buildReminder24hEmail({ booking, meetingType })],
  ["reminder-1h", buildReminder1hEmail({ booking, meetingType })],
] as const;

const index: string[] = [
  `<!doctype html><meta charset=utf-8><title>Email previews</title>`,
  `<body style="font-family:system-ui,sans-serif;background:#FAFAF8;padding:40px;line-height:1.6;">`,
  `<h1 style="font-family:Georgia,serif;">Email previews</h1>`,
  `<ul>`,
];

for (const [name, built] of templates) {
  writeFileSync(join(outDir, `${name}.html`), built.html, "utf8");
  index.push(
    `<li><a href="./${name}.html"><strong>${name}</strong></a> — ${built.subject}</li>`
  );
}
index.push(`</ul></body>`);
writeFileSync(join(outDir, "index.html"), index.join("\n"), "utf8");

console.log(`Wrote ${templates.length} previews to ${outDir}`);
