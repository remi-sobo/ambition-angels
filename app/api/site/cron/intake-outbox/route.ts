import { NextRequest, NextResponse } from "next/server";
import { retryPending } from "@/lib/site/outbox";
import { alertIfStuck } from "@/lib/site/outboxAlert";

// Website cron (specs/bloomos-repo-split.md §6a): every 15 minutes, re-send
// any form waiting in the intake outbox to BloomOS (same submission_id, so
// never twice), then email Remi once a day if anything has waited over 24h.
// Auth: Bearer CRON_SECRET, which Vercel sends on cron invocations.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const retried = await retryPending(100);
    const alert = await alertIfStuck();
    return NextResponse.json({ ...retried, ...alert });
  } catch (err) {
    console.error("[site-cron] intake-outbox failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "outbox run failed" }, { status: 500 });
  }
}
