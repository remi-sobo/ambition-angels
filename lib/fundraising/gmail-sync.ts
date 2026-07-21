import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listMessageIds,
  getMessage,
  counterpartyEmails,
  staffCoPresent,
} from "@/lib/google/gmail-read";

// Phase 1C.b — chunked Gmail → interactions sync. One page of messages per
// `advanceGmailJob` call so a single Vercel invocation never overruns; the
// admin UI / cron polls until status leaves 'running'. Matching is strict:
// a message is logged only against constituents whose VERIFIED email is the
// message's counterparty (no name matching). Idempotent on the Gmail message
// id via interactions_external_idx, so re-listing a page is harmless.

const PAGE = 40;

type Counts = { scanned: number; logged: number; skipped: number; maxInternal: number };
type JobError = { message: string; occurred_at: string; message_id?: string };

export type GmailJob = {
  id: string;
  org_id: string | null;
  mailbox: string;
  mode: "backfill" | "incremental";
  status: "running" | "completed" | "failed" | "partial";
  page_token: string | null;
  last_internal_date: number;
  counts: Counts;
  errors: JobError[];
  started_at: string;
  finished_at: string | null;
};

function normalizeCounts(c: Partial<Counts> | null | undefined, watermark: number): Counts {
  return {
    scanned: c?.scanned ?? 0,
    logged: c?.logged ?? 0,
    skipped: c?.skipped ?? 0,
    maxInternal: c?.maxInternal ?? watermark,
  };
}

export async function createGmailJob(
  supabase: SupabaseClient,
  opts: { orgId: string | null; mode: "backfill" | "incremental"; watermark: number }
): Promise<GmailJob> {
  const { data, error } = await supabase
    .from("gmail_sync_jobs")
    .insert({
      org_id: opts.orgId,
      mode: opts.mode,
      status: "running",
      last_internal_date: opts.watermark,
      counts: { scanned: 0, logged: 0, skipped: 0, maxInternal: opts.watermark },
    })
    .select("*")
    .single();
  if (error) throw new Error(`create gmail job: ${error.message}`);
  return rowToJob(data);
}

export async function loadGmailJob(supabase: SupabaseClient, id: string): Promise<GmailJob | null> {
  const { data, error } = await supabase.from("gmail_sync_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`load gmail job: ${error.message}`);
  return data ? rowToJob(data) : null;
}

export async function latestGmailJob(supabase: SupabaseClient): Promise<GmailJob | null> {
  const { data } = await supabase
    .from("gmail_sync_jobs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? rowToJob(data) : null;
}

function rowToJob(row: Record<string, unknown>): GmailJob {
  return {
    id: row.id as string,
    org_id: (row.org_id as string | null) ?? null,
    mailbox: (row.mailbox as string) ?? "",
    mode: row.mode as GmailJob["mode"],
    status: row.status as GmailJob["status"],
    page_token: (row.page_token as string | null) ?? null,
    last_internal_date: Number(row.last_internal_date ?? 0),
    counts: normalizeCounts(row.counts as Partial<Counts>, Number(row.last_internal_date ?? 0)),
    errors: (row.errors as JobError[]) ?? [],
    started_at: row.started_at as string,
    finished_at: (row.finished_at as string | null) ?? null,
  };
}

// Process exactly one page of messages, persist, and return the updated job.
export async function advanceGmailJob(supabase: SupabaseClient, job: GmailJob): Promise<GmailJob> {
  if (job.status !== "running") return job;

  // The incremental query is derived from the watermark captured at job
  // creation and must stay stable across pages (Gmail page tokens are bound to
  // the query), so we keep last_internal_date fixed during the run and track
  // the running max in counts.maxInternal, promoting it only at finalize.
  const query =
    job.mode === "incremental" && job.last_internal_date > 0
      ? `after:${Math.floor(job.last_internal_date / 1000)}`
      : null;

  let page: { ids: string[]; nextPageToken: string | null };
  try {
    page = await listMessageIds({ pageToken: job.page_token, query, max: PAGE });
  } catch (e: unknown) {
    return finalize(supabase, job, "failed", [
      ...job.errors,
      { message: `list: ${msg(e)}`, occurred_at: new Date().toISOString() },
    ]);
  }

  const counts = { ...job.counts };
  const errors = [...job.errors];

  for (const id of page.ids) {
    counts.scanned += 1;
    let parsed;
    try {
      parsed = await getMessage(id);
    } catch (e: unknown) {
      errors.push({ message: `get: ${msg(e)}`, message_id: id, occurred_at: new Date().toISOString() });
      counts.skipped += 1;
      continue;
    }
    if (!parsed) {
      counts.skipped += 1;
      continue;
    }
    if (parsed.internalDate > counts.maxInternal) counts.maxInternal = parsed.internalDate;

    const parties = counterpartyEmails(parsed);
    if (parties.length === 0) {
      counts.skipped += 1; // staff-to-staff / no external address
      continue;
    }

    let constituentQuery = supabase
      .from("constituents")
      .select("id, org_id, emails")
      .overlaps("emails", parties);
    if (job.org_id) constituentQuery = constituentQuery.eq("org_id", job.org_id);
    const { data: matches, error: matchErr } = await constituentQuery;
    if (matchErr) {
      errors.push({ message: `match: ${matchErr.message}`, message_id: id, occurred_at: new Date().toISOString() });
      counts.skipped += 1;
      continue;
    }
    if (!matches || matches.length === 0) {
      counts.skipped += 1; // counterparty isn't a known constituent
      continue;
    }

    const matchRows = matches as { id: string; org_id: string; emails: string[] }[];
    // Was a teammate a raw participant on this message? Computed before the
    // staff de-dupe (counterpartyEmails drops staff) so intro handoffs are
    // detectable. (Column name shannon_present is historical.)
    const sawTeammate = staffCoPresent(parsed);

    const rows = matchRows.map((c) => ({
      org_id: c.org_id,
      constituent_id: c.id,
      kind: "email",
      direction: parsed!.direction,
      subject: parsed!.subject,
      thread_id: parsed!.threadId,
      body_preview: parsed!.snippet,
      occurred_at: new Date(parsed!.internalDate).toISOString(),
      matched_email: (c.emails ?? []).find((e) => parties.includes(e.toLowerCase())) ?? parties[0],
      logged_by: "gmail",
      external_source: "gmail",
      external_id: parsed!.messageId,
      is_private: false,
      shannon_present: sawTeammate,
    }));

    const { error: upErr } = await supabase
      .from("interactions")
      .upsert(rows, { onConflict: "external_source,external_id,constituent_id", ignoreDuplicates: true });
    if (upErr) {
      errors.push({ message: `upsert: ${upErr.message}`, message_id: id, occurred_at: new Date().toISOString() });
    } else {
      counts.logged += 1;
      // Connection candidate: an outbound message (from the connected
      // mailbox) with a teammate on it, reconciled to an external
      // constituent — the person being introduced. Upsert one PENDING row per
      // thread; ignoreDuplicates means a thread already added/dismissed never
      // resurfaces. Best-effort: a candidate failure must not break the
      // interactions sync.
      if (sawTeammate && parsed.direction === "outbound") {
        const primary = matchRows[0];
        const { data: inter } = await supabase
          .from("interactions")
          .select("id")
          .eq("external_source", "gmail")
          .eq("external_id", parsed.messageId)
          .eq("constituent_id", primary.id)
          .maybeSingle();
        const { error: candErr } = await supabase
          .from("connection_candidates")
          .upsert(
            {
              org_id: primary.org_id,
              thread_id: parsed.threadId,
              interaction_id: (inter as { id: string } | null)?.id ?? null,
              constituent_id: primary.id,
              subject: parsed.subject,
            },
            { onConflict: "thread_id", ignoreDuplicates: true }
          );
        if (candErr) {
          errors.push({
            message: `candidate: ${candErr.message}`,
            message_id: id,
            occurred_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  // More pages → persist progress and stay running. No more pages → finalize.
  if (page.nextPageToken) {
    const { data, error } = await supabase
      .from("gmail_sync_jobs")
      .update({ page_token: page.nextPageToken, counts, errors, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    if (error) throw new Error(`save gmail job: ${error.message}`);
    return rowToJob(data);
  }

  return finalize(
    supabase,
    { ...job, counts, last_internal_date: Math.max(job.last_internal_date, counts.maxInternal) },
    errors.length > 0 ? "partial" : "completed",
    errors
  );
}

async function finalize(
  supabase: SupabaseClient,
  job: GmailJob,
  status: GmailJob["status"],
  errors: JobError[]
): Promise<GmailJob> {
  const { data, error } = await supabase
    .from("gmail_sync_jobs")
    .update({
      status,
      errors,
      counts: job.counts,
      page_token: null,
      last_internal_date: job.last_internal_date,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (error) throw new Error(`finalize gmail job: ${error.message}`);
  return rowToJob(data);
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
