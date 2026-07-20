/**
 * Chunk-based HubSpot read-only sync — HTTP surface.
 *
 * The admin "Sync now" button calls POST to advance ONE chunk per request and
 * polls the same endpoint until `status` is no longer 'running'. GET returns
 * the current (or latest) job state without advancing it.
 *
 * All the sync logic lives in lib/hubspot/sync-engine.ts so the scheduled cron
 * (/api/cron/hubspot-sync) can drive the same job to completion server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/auth";
import { requireEntitlement } from "@/lib/admin/entitlements";
import {
  createJob,
  loadJob,
  loadLatestJob,
  runChunk,
  jobToResponse,
} from "@/lib/hubspot/sync-engine";

export async function POST(req: NextRequest) {
  // AA-site surface (core fence): the HubSpot pipeline belongs to the resident
  // org only — authentication alone must not open another tenant's sync.
  const ent = await requireEntitlement("aa.hubspot_mirror");
  if (!ent.ok) {
    return NextResponse.json({ error: ent.error }, { status: ent.status });
  }

  const body = await req.json().catch(() => ({}));
  const jobId =
    body && typeof body === "object" && typeof body.jobId === "string"
      ? body.jobId
      : null;

  let job = jobId ? await loadJob(jobId) : await createJob(await getAdminUser());
  if (jobId && !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!job) {
    return NextResponse.json({ error: "Could not start sync" }, { status: 500 });
  }

  if (job.status !== "running") {
    return NextResponse.json(jobToResponse(job));
  }

  job = await runChunk(job);
  return NextResponse.json(jobToResponse(job));
}

export async function GET(req: NextRequest) {
  const ent = await requireEntitlement("aa.hubspot_mirror");
  if (!ent.ok) {
    return NextResponse.json({ error: ent.error }, { status: ent.status });
  }
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");

  if (jobId) {
    const job = await loadJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(jobToResponse(job));
  }

  // No jobId → return the most recent job (handy for "last synced" display).
  const job = await loadLatestJob();
  return NextResponse.json(job ? jobToResponse(job) : { job: null });
}
