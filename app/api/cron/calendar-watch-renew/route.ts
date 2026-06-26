/**
 * Cron: renew Google Calendar push channels (BloomOS Agenda Phase 5). Channels
 * expire (~7 days), so this starts channels for newly-connected calendars and
 * renews those nearing expiry. Auth via Bearer CRON_SECRET. Inert (no-op) until
 * a public webhook URL is configured — the cron poll remains the safety net.
 */
import { NextRequest, NextResponse } from "next/server";
import { renewExpiringWatches } from "@/lib/google/watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = await renewExpiringWatches(new Date());
  return NextResponse.json(res);
}
