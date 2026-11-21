/**
 * Cron Gmail → interactions sync (Phase 1C.b). Auth via Bearer CRON_SECRET
 * (Vercel sets it on cron invocations). Resumes a running job, otherwise starts
 * an incremental run from the last watermark (or a backfill if none has ever
 * run), and advances chunks until the job finishes or the function budget is
 * nearly spent — the next cron tick picks up any remainder.
 *
 * Requires the gmail.readonly scope on GOOGLE_REFRESH_TOKEN.
 *
 * The mailbox belongs to one org, resolved from data
 * (lib/integrations/env-owner.ts). If that can't be resolved unambiguously the
 * cron does nothing and says why.
 *
 * PAUSED: see lib/fundraising/gmail-sync-flag.ts. While GMAIL_SYNC_PAUSED is
 * true this returns { status: "paused" } and never touches Gmail or the
 * database. The vercel.json cron entry is removed too.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  advanceGmailJob,
  createGmailJob,
  latestGmailJob,
  type GmailJob,
} from "@/lib/fundraising/gmail-sync";
import { resolveEnvIntegrationOwner } from "@/lib/integrations/env-owner";
import { GMAIL_SYNC_PAUSED, GMAIL_SYNC_PAUSED_MESSAGE } from "@/lib/fundraising/gmail-sync-flag";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (GMAIL_SYNC_PAUSED) {
    return NextResponse.json({ status: "paused", reason: GMAIL_SYNC_PAUSED_MESSAGE });
  }
  const owner = await resolveEnvIntegrationOwner("gmail_sync");
  if (!owner.ok) {
    return NextResponse.json({ status: "skipped", reason: owner.reason });
  }
  const supabase = getSupabaseAdmin();

  let job: GmailJob | null = await latestGmailJob(supabase, owner.orgId);
  if (!job || job.status !== "running") {
    const watermark = job?.last_internal_date ?? 0;
    job = await createGmailJob(supabase, {
      orgId: owner.orgId,
      mode: watermark > 0 ? "incremental" : "backfill",
      watermark,
    });
  }

  const start = Date.now();
  while (job.status === "running" && Date.now() - start < 50_000) {
    job = await advanceGmailJob(supabase, job);
  }

  return NextResponse.json({ status: job.status, mode: job.mode, counts: job.counts });
}
