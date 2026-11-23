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
import { resolveEnvIntegrationOwner } from "@/lib/integrations/env-owner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FRESH_FOR_MS = 20 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The env token belongs to one org. No owner, or an ambiguous one → skip.
  const owner = await resolveEnvIntegrationOwner("hubspot");
  if (!owner.ok) {
    return NextResponse.json({ status: "skipped", reason: owner.reason });
  }
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    return NextResponse.json({ status: "skipped", reason: "HUBSPOT_ACCESS_TOKEN is not set" });
  }

  // Resume an in-flight job if one is mid-run. Otherwise start a fresh sync,
  // unless one already started in the last 20 hours: the schedule fires every
  // 10 minutes inside one daily hour so a long sync can finish across ticks,
  // and the ticks after it finishes must not start another full sync.
  let job = await loadLatestJob(owner.orgId);
  if (!job || job.status !== "running") {
    if (job && Date.now() - new Date(job.started_at).getTime() < FRESH_FOR_MS) {
      return NextResponse.json({ status: "skipped", reason: "synced in the last 20 hours", last: job.status });
    }
    job = await createJob(owner.orgId, null); // null triggered_by = system/cron
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
