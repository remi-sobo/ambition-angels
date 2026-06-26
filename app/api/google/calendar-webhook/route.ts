/**
 * Google Calendar push-notification webhook (BloomOS Agenda Phase 5).
 *
 * Google POSTs here when a watched calendar changes (events.watch). We identify
 * the connection by the channel id, verify the channel token (so a spoofed POST
 * can't trigger a sync), and run an incremental sync for that user. Always acks
 * 200 quickly — Google retries on non-2xx, and the cron poll is the safety net.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listActiveCalendarConnections } from "@/lib/google/connection";
import { syncUserCalendar, syncWindow } from "@/lib/agenda/calendar-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const token = req.headers.get("x-goog-channel-token");
  const state = req.headers.get("x-goog-resource-state");

  // The first message after watch() is a 'sync' handshake — ack and ignore.
  if (state === "sync" || !channelId) return NextResponse.json({ ok: true });

  const conns = await listActiveCalendarConnections().catch(() => []);
  const conn = conns.find((c) => c.watch?.channelId === channelId);
  if (!conn || !conn.watch) return NextResponse.json({ ok: true }); // unknown channel → ignore

  if (conn.watch.token && conn.watch.token !== token) {
    // Wrong token: someone's guessing channel ids. Refuse without syncing.
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  try {
    await syncUserCalendar(getSupabaseAdmin(), conn, syncWindow(new Date()));
  } catch (e) {
    console.error("[calendar-webhook] sync failed:", e);
    // Still ack — the poll will reconcile; a 500 just makes Google retry-storm.
  }
  return NextResponse.json({ ok: true });
}
