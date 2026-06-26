/**
 * Chunk-based HubSpot read-only sync engine.
 *
 * Extracted from app/api/admin/hubspot/sync/route.ts so it can be driven two
 * ways: interactively (the admin "Sync now" button polls one chunk per
 * request) and on a schedule (the /api/cron/hubspot-sync cron drives the whole
 * job to completion in one server-side invocation — see runJobToCompletion).
 *
 * The work is too large for a single quick request, so we advance one chunk at
 * a time: each runChunk() processes ~250 records or ~30s, whichever comes
 * first, and persists the job state in `hs_sync_jobs`.
 *
 * Step order: contacts → companies → deals → engagements. The freshly
 * refreshed hs_* mirror is projected into the fundraising spine (constituents,
 * opportunities, gifts, AIG tags, interactions) by fr_sync_hubspot_to_spine().
 * That projection runs as soon as the DEALS step finishes — not only at the
 * very end — so the pipeline board reflects HubSpot even if the engagements
 * step (the long tail) is still running or the browser tab is closed early.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { type AdminUser } from "@/lib/admin/auth";
import {
  fetchContacts,
  fetchCompanies,
  fetchDeals,
  fetchEngagements,
  ENGAGEMENT_SUBTYPES,
  type EngagementSubtype,
  type HubSpotRecord,
  type Page,
} from "@/lib/hubspot/fetchers";
import {
  upsertContacts,
  upsertCompanies,
  upsertDeals,
  upsertEngagements,
  type EngagementUpsertResult,
} from "@/lib/hubspot/upserts";

// ── Types ──────────────────────────────────────────────────────────────────

export type Step = "contacts" | "companies" | "deals" | "engagements";
const STEP_ORDER: Step[] = ["contacts", "companies", "deals", "engagements"];

type Cursors = Record<Step, string | null>;
type Counts = Record<Step, number>;
type ErrorEntry = {
  step: Step;
  message: string;
  occurred_at: string;
  // Optional context for per-record soft failures (engagements only).
  subtype?: string;
  hubspot_id?: string;
};

// Cap on detailed per-record JSON failures stored on a single job row, to
// keep the jsonb column from ballooning. Anything beyond the cap rolls up
// into a summary entry "+ N additional records skipped due to JSON errors".
const SOFT_FAIL_CAP = 50;
const SOFT_FAIL_SUFFIX = "additional records skipped due to JSON errors";

function isSoftFailSummary(e: ErrorEntry): boolean {
  return e.message.startsWith("+ ") && e.message.endsWith(SOFT_FAIL_SUFFIX);
}

function appendSoftFailure(
  errors: ErrorEntry[],
  step: Step,
  f: EngagementUpsertResult["failed"][number]
): ErrorEntry[] {
  const detailed = errors.filter((e) => !isSoftFailSummary(e)).length;
  const now = new Date().toISOString();
  if (detailed < SOFT_FAIL_CAP) {
    return [
      ...errors,
      {
        step,
        subtype: f.subtype,
        hubspot_id: f.hubspot_id,
        message: f.error_message,
        occurred_at: now,
      },
    ];
  }
  const idx = errors.findIndex(isSoftFailSummary);
  if (idx >= 0) {
    const m = errors[idx].message.match(/^\+ (\d+)/);
    const count = (m ? parseInt(m[1], 10) : 0) + 1;
    return [
      ...errors.slice(0, idx),
      { ...errors[idx], message: `+ ${count} ${SOFT_FAIL_SUFFIX}`, occurred_at: now },
      ...errors.slice(idx + 1),
    ];
  }
  return [
    ...errors,
    { step, message: `+ 1 ${SOFT_FAIL_SUFFIX}`, occurred_at: now },
  ];
}

export type JobRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed" | "partial";
  triggered_by: AdminUser | null;
  current_step: Step | null;
  cursors: Cursors;
  counts: Counts;
  errors: ErrorEntry[];
};

// ── Chunk budget ───────────────────────────────────────────────────────────

const MAX_RECORDS_PER_CHUNK = 250;
const MAX_MS_PER_CHUNK = 30_000;

// ── Engagement sub-cursor helpers ──────────────────────────────────────────

type EngagementState = { subtype: EngagementSubtype; after: string | null };

function parseEngagementCursor(s: string | null): EngagementState {
  if (!s) return { subtype: "emails", after: null };
  const idx = s.indexOf(":");
  if (idx === -1) {
    return { subtype: "emails", after: null };
  }
  const subtype = s.slice(0, idx) as EngagementSubtype;
  const after = s.slice(idx + 1) || null;
  if (!ENGAGEMENT_SUBTYPES.includes(subtype)) {
    return { subtype: "emails", after: null };
  }
  return { subtype, after };
}

function serializeEngagementCursor(
  subtype: EngagementSubtype,
  after: string | null
): string {
  return `${subtype}:${after ?? ""}`;
}

function nextEngagementSubtype(
  current: EngagementSubtype
): EngagementSubtype | null {
  const i = ENGAGEMENT_SUBTYPES.indexOf(current);
  return ENGAGEMENT_SUBTYPES[i + 1] ?? null;
}

// ── DB helpers ─────────────────────────────────────────────────────────────

const supabase = () => getSupabaseAdmin();

export async function loadJob(id: string): Promise<JobRow | null> {
  const { data, error } = await supabase()
    .from("hs_sync_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`load job: ${error.message}`);
  return (data as JobRow | null) ?? null;
}

export async function loadLatestJob(): Promise<JobRow | null> {
  const { data, error } = await supabase()
    .from("hs_sync_jobs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`load latest job: ${error.message}`);
  return (data as JobRow | null) ?? null;
}

export async function createJob(triggeredBy: AdminUser | null): Promise<JobRow> {
  const initial = {
    status: "running" as const,
    triggered_by: triggeredBy,
    current_step: "contacts" as Step,
    cursors: {
      contacts: null,
      companies: null,
      deals: null,
      engagements: null,
    } satisfies Cursors,
    counts: {
      contacts: 0,
      companies: 0,
      deals: 0,
      engagements: 0,
    } satisfies Counts,
    errors: [] as ErrorEntry[],
  };
  const { data, error } = await supabase()
    .from("hs_sync_jobs")
    .insert(initial)
    .select("*")
    .single();
  if (error) throw new Error(`create job: ${error.message}`);
  return data as JobRow;
}

async function saveJob(job: JobRow): Promise<JobRow> {
  const { data, error } = await supabase()
    .from("hs_sync_jobs")
    .update({
      status: job.status,
      finished_at: job.finished_at,
      current_step: job.current_step,
      cursors: job.cursors,
      counts: job.counts,
      errors: job.errors,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (error) throw new Error(`save job: ${error.message}`);
  return data as JobRow;
}

// ── Spine projection ───────────────────────────────────────────────────────

// Project the refreshed hs_* mirror into the fundraising spine. Idempotent, so
// it's safe to call more than once per job (we run it after the deals step and
// again when the whole job finishes). Errors are recorded on the job, not
// thrown, so a projection hiccup never aborts the mirror sync.
async function runSpineProjection(job: JobRow, step: Step): Promise<void> {
  try {
    const { error } = await supabase().rpc("fr_sync_hubspot_to_spine");
    if (error) throw new Error(error.message);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    job.errors = [
      ...job.errors,
      { step, message: `spine sync: ${msg}`, occurred_at: new Date().toISOString() },
    ];
  }
}

// ── Step processors ────────────────────────────────────────────────────────

type ProcessResult = {
  processed: number;
  nextCursor: string | null;
  // Per-record soft failures inside this page (engagements only). Records
  // counted in `processed` are the ones that actually landed.
  failures?: EngagementUpsertResult["failed"];
};

async function processContactsPage(cursor: string | null): Promise<ProcessResult> {
  const page: Page = await fetchContacts(cursor);
  const n = await upsertContacts(page.records);
  return { processed: n, nextCursor: page.nextCursor };
}

async function processCompaniesPage(cursor: string | null): Promise<ProcessResult> {
  const page: Page = await fetchCompanies(cursor);
  const n = await upsertCompanies(page.records);
  return { processed: n, nextCursor: page.nextCursor };
}

async function processDealsPage(cursor: string | null): Promise<ProcessResult> {
  const page: Page = await fetchDeals(cursor);
  const n = await upsertDeals(page.records);
  return { processed: n, nextCursor: page.nextCursor };
}

async function processEngagementsPage(cursor: string | null): Promise<ProcessResult> {
  const state = parseEngagementCursor(cursor);
  const page: Page = await fetchEngagements(state.subtype, state.after);
  const result = await upsertEngagements(state.subtype, page.records as HubSpotRecord[]);

  // Where do we go next?
  let next: string | null;
  if (page.nextCursor) {
    // More of the same sub-type.
    next = serializeEngagementCursor(state.subtype, page.nextCursor);
  } else {
    // Move to next sub-type, or null if all done.
    const nextSub = nextEngagementSubtype(state.subtype);
    next = nextSub ? serializeEngagementCursor(nextSub, null) : null;
  }
  return {
    processed: result.inserted,
    nextCursor: next,
    failures: result.failed.length > 0 ? result.failed : undefined,
  };
}

async function processOnePageForStep(
  step: Step,
  cursor: string | null
): Promise<ProcessResult> {
  switch (step) {
    case "contacts":
      return processContactsPage(cursor);
    case "companies":
      return processCompaniesPage(cursor);
    case "deals":
      return processDealsPage(cursor);
    case "engagements":
      return processEngagementsPage(cursor);
  }
}

// ── Step advancement ───────────────────────────────────────────────────────

function nextStep(current: Step): Step | null {
  const i = STEP_ORDER.indexOf(current);
  return STEP_ORDER[i + 1] ?? null;
}

// ── Chunk runner ───────────────────────────────────────────────────────────

export async function runChunk(jobInput: JobRow): Promise<JobRow> {
  // Mutate a local clone — properties change inside the loop but the
  // binding itself is stable, so prefer-const is happy.
  const job: JobRow = { ...jobInput };
  if (job.status !== "running" || !job.current_step) return job;

  const startMs = Date.now();
  let processed = 0;

  while (
    processed < MAX_RECORDS_PER_CHUNK &&
    Date.now() - startMs < MAX_MS_PER_CHUNK &&
    job.current_step
  ) {
    const step: Step = job.current_step;
    const stepCursor = job.cursors[step];

    let result: ProcessResult;
    try {
      result = await processOnePageForStep(step, stepCursor);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      job.errors = [
        ...job.errors,
        { step, message: msg, occurred_at: new Date().toISOString() },
      ];
      job.cursors = { ...job.cursors, [step]: null };
      job.current_step = nextStep(step);
      // Yield this chunk on error — let the client poll for the next chunk
      // to start cleanly on the next step.
      break;
    }

    job.counts = { ...job.counts, [step]: job.counts[step] + result.processed };
    processed += result.processed;
    job.cursors = { ...job.cursors, [step]: result.nextCursor };

    // Per-record soft failures (engagements only): record the bad
    // hubspot_ids on the job and keep going. The good records in this
    // page already landed via the per-record fallback in upsertEngagements.
    if (result.failures && result.failures.length > 0) {
      for (const f of result.failures) {
        job.errors = appendSoftFailure(job.errors, step, f);
      }
    }

    if (!result.nextCursor) {
      // Step complete. The moment the DEALS step finishes, project the spine
      // so the pipeline board is fresh without waiting for engagements (the
      // long tail) or the browser tab to stay open to the very end.
      if (step === "deals") {
        await runSpineProjection(job, step);
      }
      job.current_step = nextStep(step);
    }
  }

  // Finalize if we've run out of steps. Re-project so anything that landed
  // after the deals step (and the dedup/AIG/interactions passes) is reflected.
  if (!job.current_step) {
    await runSpineProjection(job, "engagements");
    job.status = job.errors.length > 0 ? "partial" : "completed";
    job.finished_at = new Date().toISOString();
  }

  return saveJob(job);
}

// ── Full-run driver (cron) ─────────────────────────────────────────────────

/**
 * Drive a job to completion server-side, chunk after chunk, until it finishes
 * or `deadlineMs` (wall-clock budget for this invocation) is hit. Used by the
 * scheduled cron. If the deadline is reached first the job is left "running"
 * with its cursors intact, so the next cron run resumes exactly where it left
 * off — and because the spine is projected after the deals step, the board is
 * already fresh even on a run that doesn't reach engagements.
 */
export async function runJobToCompletion(
  job: JobRow,
  deadlineMs: number
): Promise<JobRow> {
  let current = job;
  while (current.status === "running" && Date.now() < deadlineMs) {
    current = await runChunk(current);
  }
  return current;
}

export function jobToResponse(job: JobRow) {
  return {
    jobId: job.id,
    status: job.status,
    triggered_by: job.triggered_by,
    current_step: job.current_step,
    started_at: job.started_at,
    finished_at: job.finished_at,
    counts: job.counts,
    errors: job.errors,
  };
}
