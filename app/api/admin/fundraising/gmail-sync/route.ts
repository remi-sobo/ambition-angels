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
 *
 * The mailbox belongs to one org (lib/integrations/env-owner.ts); every other
 * org gets a 403, and every job read is scoped to the owner.
 *
 * PAUSED: see lib/fundraising/gmail-sync-flag.ts. While GMAIL_SYNC_PAUSED is
 * true, POST returns 503 { paused: true } without touching Gmail or creating a
 * job. GET still returns the last job (a database read only).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireEnvIntegrationOwner } from "@/lib/integrations/env-owner";
import { requirePermission } from "@/lib/admin/requirePermission";
import {
  advanceGmailJob,
  createGmailJob,
  loadGmailJob,
  latestGmailJob,
  type GmailJob,
} from "@/lib/fundraising/gmail-sync";
import { GMAIL_SYNC_PAUSED, GMAIL_SYNC_PAUSED_MESSAGE } from "@/lib/fundraising/gmail-sync-flag";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requirePermission("fundraising.write");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  if (GMAIL_SYNC_PAUSED) {
    return NextResponse.json({ error: GMAIL_SYNC_PAUSED_MESSAGE, paused: true }, { status: 503 });
  }
  const gate = await requireEnvIntegrationOwner("gmail_sync");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const orgId = gate.ctx.orgId;
  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => ({}))) as { jobId?: unknown; mode?: unknown };
  const jobId = typeof body.jobId === "string" ? body.jobId : null;

  let job: GmailJob | null;
  if (jobId) {
    job = await loadGmailJob(supabase, orgId, jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  } else {
    const mode = body.mode === "incremental" ? "incremental" : "backfill";
    const prior = await latestGmailJob(supabase, orgId);
    const watermark = mode === "incremental" ? prior?.last_internal_date ?? 0 : 0;
    job = await createGmailJob(supabase, { orgId, mode, watermark });
  }

  if (job.status === "running") job = await advanceGmailJob(supabase, job);
  return NextResponse.json(job);
}

export async function GET() {
  const guard = await requirePermission("fundraising.read");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const gate = await requireEnvIntegrationOwner("gmail_sync");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const supabase = getSupabaseAdmin();
  return NextResponse.json((await latestGmailJob(supabase, gate.ctx.orgId)) ?? null);
}
