/**
 * Scheduled HubSpot sync. Keeps the fundraising spine (and the pipeline board)
 * in step with HubSpot without anyone clicking "Sync now": refreshes the hs_*
 * mirror and projects it into constituents / opportunities / gifts via
 * fr_sync_hubspot_to_spine().
 *
 * Auth via Bearer CRON_SECRET (Vercel sets it on cron invocations). Resumes a
 * still-running job, otherwise starts a fresh full sync, and advances chunks
 * until the job finishes or the function budget is nearly spent — the next
 * cron tick resumes any remainder. Because the spine is projected the moment
 * the deals step completes, the board is fresh even on a tick that doesn't
 * reach the engagements tail.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createJob,
  loadLatestJob,
  runJobToCompletion,
} from "@/lib/hubspot/sync-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Resume an in-flight job if one is mid-run, otherwise start a fresh sync.
  let job = await loadLatestJob();
  if (!job || job.status !== "running") {
    job = await createJob(null); // null triggered_by = system/cron
  }

  // Leave ~10s headroom under maxDuration for the final saveJob/response.
  job = await runJobToCompletion(job, Date.now() + 50_000);

  return NextResponse.json({
    status: job.status,
    current_step: job.current_step,
    counts: job.counts,
    errors: job.errors.length,
  });
}
