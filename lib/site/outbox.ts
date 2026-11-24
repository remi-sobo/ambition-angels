import "server-only";
import { getSiteSupabase } from "./supabase";
import { postToBloomOS, type IntakeKind } from "./bloomos";

/**
 * Retry the website's intake outbox (specs/bloomos-repo-split.md §6a).
 * Used by the forms screen's "retry now" button and by the retry cron.
 *
 * Each pending row is re-sent with its original submission_id, so BloomOS
 * dedupes and a form is never stored twice. Outcomes per row:
 *   delivered   payload cleared, BloomOS id kept for the forms screen
 *   400         marked dead: the form itself is invalid and never will land
 *   anything    stays pending with the error and attempt count
 */

export type RetryReport = { tried: number; delivered: number; stillPending: number; dead: number };

type Row = { id: string; submission_id: string; kind: string; payload: Record<string, unknown> | null; attempts: number };

export async function retryPending(limit = 50, f: typeof fetch = fetch): Promise<RetryReport> {
  const db = getSiteSupabase();
  const { data, error } = await db
    .from("intake_outbox")
    .select("id, submission_id, kind, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`outbox read: ${error.message}`);

  const report: RetryReport = { tried: 0, delivered: 0, stillPending: 0, dead: 0 };
  for (const row of (data ?? []) as Row[]) {
    report.tried++;
    const now = new Date().toISOString();
    const payload = { ...(row.payload ?? {}), submission_id: row.submission_id };
    const r = await postToBloomOS(row.kind as IntakeKind, payload, f);
    if (r.ok) {
      await db
        .from("intake_outbox")
        .update({
          status: "delivered",
          payload: null,
          delivered_at: now,
          last_attempt_at: now,
          attempts: row.attempts + 1,
          bloomos_id: typeof r.body.id === "string" ? r.body.id : null,
          last_error: null,
        })
        .eq("id", row.id);
      report.delivered++;
    } else if (r.status === 400) {
      await db
        .from("intake_outbox")
        .update({ status: "dead", last_attempt_at: now, attempts: row.attempts + 1, last_error: `400: ${r.error}`.slice(0, 500) })
        .eq("id", row.id);
      report.dead++;
    } else {
      await db
        .from("intake_outbox")
        .update({ last_attempt_at: now, attempts: row.attempts + 1, last_error: `${r.status || "network"}: ${r.error}`.slice(0, 500) })
        .eq("id", row.id);
      report.stillPending++;
    }
  }
  return report;
}
