import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/google/gmail";
import { buildReminder24hEmail } from "@/lib/email/templates/reminder-24h";
import { buildReminder1hEmail } from "@/lib/email/templates/reminder-1h";
import type { Booking, MeetingType } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type BookingWithType = Booking & { meeting_type: MeetingType };

/**
 * Hourly cron that sends 24h and 1h reminder emails for upcoming
 * confirmed bookings. Auth via Bearer CRON_SECRET (set by Vercel
 * automatically on cron-triggered invocations, or by you for manual runs).
 *
 * 24h window: start_time in [now+23h, now+25h]
 * 1h window:  start_time in [now+30min, now+90min]
 *
 * Each booking row carries a sent flag per type, so retries / overlapping
 * cron windows can't double-send.
 */
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = Date.now();

  const r24 = await runReminderBatch({
    supabase,
    label: "24h",
    flagColumn: "reminder_sent_24h",
    windowStart: new Date(now + 23 * 3600_000),
    windowEnd: new Date(now + 25 * 3600_000),
    build: (b, m) => buildReminder24hEmail({ booking: b, meetingType: m }),
  });

  const r1 = await runReminderBatch({
    supabase,
    label: "1h",
    flagColumn: "reminder_sent_1h",
    windowStart: new Date(now + 30 * 60_000),
    windowEnd: new Date(now + 90 * 60_000),
    build: (b, m) => buildReminder1hEmail({ booking: b, meetingType: m }),
  });

  return NextResponse.json({
    "24h": r24,
    "1h": r1,
  });
}

function isAuthed(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

type BatchResult = { found: number; sent: number; errors: string[] };

async function runReminderBatch(args: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  label: string;
  flagColumn: "reminder_sent_24h" | "reminder_sent_1h";
  windowStart: Date;
  windowEnd: Date;
  build: (b: Booking, m: MeetingType) => { subject: string; html: string; text: string };
}): Promise<BatchResult> {
  const { supabase, flagColumn, windowStart, windowEnd, build } = args;

  const { data, error } = await supabase
    .from("bookings")
    .select("*, meeting_type:meeting_types(*)")
    .eq("status", "confirmed")
    .eq(flagColumn, false)
    .gte("start_time", windowStart.toISOString())
    .lt("start_time", windowEnd.toISOString());

  if (error) {
    return { found: 0, sent: 0, errors: [error.message] };
  }
  const rows = (data ?? []) as BookingWithType[];

  let sent = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const { meeting_type, ...booking } = row;
      const email = build(booking as Booking, meeting_type);
      await sendEmail({
        to: booking.attendee_email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      const { error: updateErr } = await supabase
        .from("bookings")
        .update({ [flagColumn]: true, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updateErr) {
        // Email sent but flag update failed → log; next run may double-send.
        // Accepted trade: better one extra email than missed reminder.
        errors.push(`flag update ${row.id}: ${updateErr.message}`);
      } else {
        sent++;
      }
    } catch (err) {
      errors.push(
        `send ${row.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { found: rows.length, sent, errors };
}
