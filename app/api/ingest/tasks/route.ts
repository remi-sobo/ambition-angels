import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isTaskCategory, isTaskPriority, isAdminUserId } from "@/app/admin/ops/_types/ops";
import { audit } from "@/lib/audit";

/**
 * Machine-to-machine task ingest (BloomOS).
 *
 * Lets an outside agent — e.g. Shannon's Claude Cowork morning run — seed tasks
 * into BloomOS. Authenticated by a Bearer token (TASK_INGEST_SECRET), the same
 * pattern the cron routes use. Tasks default to assigned_to='shannon', land on
 * the ops board (Today's Moves, the Tasks surface, the Assignee filter), and
 * carry a 'cowork' label so they're easy to spot/filter.
 *
 * Idempotent: each task carries a hidden `sys:ref:<key>` label derived from the
 * caller's `dedupe_key` (or a hash of the title). A re-run with the same key is
 * skipped instead of duplicated — so re-running the morning report, or the same
 * email recurring, won't pile up tasks.
 *
 * POST body: a single task object, or { tasks: [ ...up to 100 ] }. Each task:
 *   { title (required), description?, due_date? (YYYY-MM-DD), priority?
 *     ('urgent'|'high'|'medium'|'low'), category? (default 'operations'),
 *     labels? (string[]), pin_today? (default true), assignee?
 *     ('remi'|'shannon', default 'shannon'), dedupe_key? }
 */
const MAX_BATCH = 100;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

type IngestTask = Record<string, unknown>;
type Result = { title: string; status: "created" | "skipped" | "error"; id?: string; error?: string };

function refLabel(assignee: string, title: string, dedupeKey: unknown): string {
  const raw =
    typeof dedupeKey === "string" && dedupeKey.trim()
      ? dedupeKey.trim()
      : createHash("sha1").update(`${assignee}|${title}`).digest("hex").slice(0, 16);
  return `sys:ref:${raw.replace(/[^a-zA-Z0-9_:-]/g, "-").slice(0, 80)}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.TASK_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Task ingest is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as IngestTask | { tasks?: IngestTask[] } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const items: IngestTask[] = Array.isArray((body as { tasks?: IngestTask[] }).tasks)
    ? (body as { tasks: IngestTask[] }).tasks
    : [body as IngestTask];
  if (items.length === 0) {
    return NextResponse.json({ error: "No tasks provided" }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json({ error: `Too many tasks (max ${MAX_BATCH})` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const results: Result[] = [];

  for (const t of items) {
    const title = typeof t.title === "string" ? t.title.trim().slice(0, 300) : "";
    if (!title) {
      results.push({ title: "", status: "error", error: "title is required" });
      continue;
    }
    const assignee = isAdminUserId(t.assignee) ? (t.assignee as "remi" | "shannon") : "shannon";
    const category = isTaskCategory(t.category) ? (t.category as string) : "operations";
    const priority = isTaskPriority(t.priority) ? (t.priority as string) : "medium";
    const due_date = isISODate(t.due_date) ? (t.due_date as string) : null;
    const ref = refLabel(assignee, title, t.dedupe_key);

    try {
      // Dedupe: skip if a task with this ref already exists (any state).
      const { data: existing } = await supabase
        .from("ops_tasks")
        .select("id")
        .contains("labels", [ref])
        .limit(1)
        .maybeSingle();
      if (existing) {
        results.push({ title, status: "skipped", id: existing.id as string });
        continue;
      }

      const callerLabels = Array.isArray(t.labels)
        ? (t.labels as unknown[]).filter((l): l is string => typeof l === "string").map((l) => l.slice(0, 40))
        : [];
      const labels = Array.from(new Set(["cowork", ...callerLabels, ref]));

      const insert = {
        title,
        description: typeof t.description === "string" ? t.description.slice(0, 4000) : null,
        category,
        priority,
        assigned_to: assignee,
        created_by: assignee,
        due_date,
        labels,
        pinned_for_today: t.pin_today === undefined ? true : t.pin_today === true,
      };

      const { data, error } = await supabase.from("ops_tasks").insert(insert).select("id").single();
      if (error || !data) {
        console.error("[ingest/tasks] insert error:", error?.message);
        results.push({ title, status: "error", error: "insert failed" });
        continue;
      }
      await audit(req, {
        action: "ops.task.ingest",
        entityType: "ops_task",
        entityId: data.id,
        after: { title, assignee, category, source: "ingest" },
      });
      results.push({ title, status: "created", id: data.id });
    } catch (e) {
      console.error("[ingest/tasks] error:", e);
      results.push({ title, status: "error", error: "unexpected error" });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;
  return NextResponse.json({ ok: errors === 0, created, skipped, errors, results });
}
