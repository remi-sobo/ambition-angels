import "server-only";
import { Resend } from "resend";
import { getSiteSupabase } from "./supabase";

/**
 * The "a form is stuck" email (specs/bloomos-repo-split.md §6a): if any form
 * has waited in the intake outbox for more than 24 hours, tell Remi. Sent
 * once a day (the run in the 8am Pacific hour), never every 15 minutes.
 * Delivery status only: the form kind, age and last error. No names or emails.
 */

const STUCK_AFTER_MS = 24 * 60 * 60 * 1000;

export function isDailyAlertRun(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour === 8 && minute < 15;
}

export async function alertIfStuck(now = new Date()): Promise<{ stuck: number; emailed: boolean }> {
  const before = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();
  const { data, error } = await getSiteSupabase()
    .from("intake_outbox")
    .select("kind, created_at, attempts, last_error")
    .eq("status", "pending")
    .lt("created_at", before)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`outbox read: ${error.message}`);
  const stuck = (data ?? []) as { kind: string; created_at: string; attempts: number; last_error: string | null }[];
  if (stuck.length === 0 || !isDailyAlertRun(now) || !process.env.RESEND_API_KEY) {
    return { stuck: stuck.length, emailed: false };
  }
  const lines = stuck
    .map((r) => `• ${r.kind}, waiting since ${r.created_at.slice(0, 16).replace("T", " ")} UTC, ${r.attempts} tries. Last error: ${r.last_error ?? "none"}`)
    .join("\n");
  await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: "Ambition Angels <careers@mail.ambitionangels.org>",
    to: process.env.INTAKE_ALERT_EMAIL || "remi@ambitionangels.org",
    subject: `${stuck.length} website form${stuck.length === 1 ? "" : "s"} not reaching BloomOS`,
    text: `These website forms have waited more than a day to reach BloomOS. They are safe in the outbox and will keep retrying every 15 minutes.\n\n${lines}\n\nSee them and retry: https://www.ambitionangels.org/admin/forms`,
  });
  return { stuck: stuck.length, emailed: true };
}
