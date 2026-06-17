/**
 * Cron Gmail → interactions sync (Phase 1C.b). Auth via Bearer CRON_SECRET
 * (Vercel sets it on cron invocations). Resumes a running job, otherwise starts
 * an incremental run from the last watermark (or a backfill if none has ever
 * run), and advances chunks until the job finishes or the function budget is
 * nearly spent — the next cron tick picks up any remainder.
 *
 * Requires the gmail.readonly scope on GOOGLE_REFRESH_TOKEN.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  advanceGmailJob,
  createGmailJob,
  latestGmailJob,
  type GmailJob,
} from "@/lib/fundraising/gmail-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  let job: GmailJob | null = await latestGmailJob(supabase);
  if (!job || job.status !== "running") {
    const watermark = job?.last_internal_date ?? 0;
    // Single tenant today: the mailbox belongs to the only org.
    const { data: org } = await supabase.from("orgs").select("id").limit(1).maybeSingle();
    job = await createGmailJob(supabase, {
      orgId: (org?.id as string | undefined) ?? null,
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
