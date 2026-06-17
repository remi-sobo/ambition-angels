/**
 * Chunked Gmail → interactions sync (Phase 1C.b), admin-triggered.
 *
 * POST advances one page of messages per call and returns the job state; the
 * client polls — same endpoint with { jobId } — until status leaves 'running'.
 * POST with no jobId starts a job: { mode: 'backfill' } (default, walks all
 * history) or { mode: 'incremental' } (only mail newer than the last
 * watermark). GET returns the most recent job for a "last synced" display.
 *
 * Requires the gmail.readonly scope on GOOGLE_REFRESH_TOKEN; without it the
 * job completes having logged zero and records the 403 in errors.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getOrgContext } from "@/lib/admin/auth";
import {
  advanceGmailJob,
  createGmailJob,
  loadGmailJob,
  latestGmailJob,
  type GmailJob,
} from "@/lib/fundraising/gmail-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => ({}))) as { jobId?: unknown; mode?: unknown };
  const jobId = typeof body.jobId === "string" ? body.jobId : null;

  let job: GmailJob | null;
  if (jobId) {
    job = await loadGmailJob(supabase, jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  } else {
    const ctx = await getOrgContext();
    const mode = body.mode === "incremental" ? "incremental" : "backfill";
    const prior = await latestGmailJob(supabase);
    const watermark = mode === "incremental" ? prior?.last_internal_date ?? 0 : 0;
    job = await createGmailJob(supabase, { orgId: ctx?.orgId ?? null, mode, watermark });
  }

  if (job.status === "running") job = await advanceGmailJob(supabase, job);
  return NextResponse.json(job);
}

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  return NextResponse.json((await latestGmailJob(supabase)) ?? null);
}
