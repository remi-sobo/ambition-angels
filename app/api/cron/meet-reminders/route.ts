import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/google/gmail";
import { getBookingHost, type BookingHost } from "@/lib/meet/host";
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

  // Per-org iteration. The service-role client bypasses RLS, so every read
  // below is fenced to one org at a time and the host identity is resolved
  // for that same org — never "enumerate every tenant's bookings, act per row".
  const { data: orgs, error: orgsError } = await supabase.from("orgs").select("id");
  if (orgsError) {
    return NextResponse.json({ error: `orgs: ${orgsError.message}` }, { status: 500 });
  }

  const perOrg: Record<string, { "24h": BatchResult; "1h": BatchResult }> = {};
  for (const o of (orgs ?? []) as { id: string }[]) {
    const r24 = await runReminderBatch({
      supabase,
      orgId: o.id,
      label: "24h",
      flagColumn: "reminder_sent_24h",
      windowStart: new Date(now + 23 * 3600_000),
      windowEnd: new Date(now + 25 * 3600_000),
      build: (b, m, host) => buildReminder24hEmail({ booking: b, meetingType: m, host }),
    });
    const r1 = await runReminderBatch({
      supabase,
      orgId: o.id,
      label: "1h",
      flagColumn: "reminder_sent_1h",
      windowStart: new Date(now + 30 * 60_000),
      windowEnd: new Date(now + 90 * 60_000),
      build: (b, m, host) => buildReminder1hEmail({ booking: b, meetingType: m, host }),
    });
    perOrg[o.id] = { "24h": r24, "1h": r1 };
  }

  const sum = (k: "24h" | "1h") =>
    Object.values(perOrg).reduce(
      (acc, r) => ({ found: acc.found + r[k].found, sent: acc.sent + r[k].sent, errors: [...acc.errors, ...r[k].errors] }),
      { found: 0, sent: 0, errors: [] as string[] }
    );
  return NextResponse.json({ "24h": sum("24h"), "1h": sum("1h"), orgs: Object.keys(perOrg).length });
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
  orgId: string;
  label: string;
  flagColumn: "reminder_sent_24h" | "reminder_sent_1h";
  windowStart: Date;
  windowEnd: Date;
  build: (b: Booking, m: MeetingType, host: BookingHost) => { subject: string; html: string; text: string };
}): Promise<BatchResult> {
  const { supabase, orgId, flagColumn, windowStart, windowEnd, build } = args;
  const { data, error } = await supabase
    .from("bookings")
    .select("*, meeting_type:meeting_types(*)")
    .eq("org_id", orgId)
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
      const host = await getBookingHost(orgId);
      const email = build(booking as Booking, meeting_type, host);
      await sendEmail({
        to: booking.attendee_email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      const { error: updateErr } = await supabase
        .from("bookings")
        .update({ [flagColumn]: true, updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
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
