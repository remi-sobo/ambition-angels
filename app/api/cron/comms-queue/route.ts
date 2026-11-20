import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/comms/worker";

// Comms send worker (specs/comms-v2-gmail-amendment.md G2). Every minute
// (vercel.json): opens due scheduled campaigns, reaps stuck rows, and sends
// what each org's daily cap allows, paced per transport.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await drainQueue();
    for (const b of result.blocked) console.error(`[cron/comms-queue] org ${b.orgId} blocked: ${b.reason}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/comms-queue] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
