import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { isTaskCategory, isTaskPriority, isAdminUserId } from "@/app/admin/ops/_types/ops";
import { getResidentOrgId } from "@/lib/admin/orgs";
import { audit } from "@/lib/audit";

/**
 * Shared task-ingest core, used by both the HTTP endpoint
 * (POST /api/ingest/tasks) and the MCP connector (/api/mcp/[secret]).
 *
 * Idempotent: every ingested task carries a hidden `sys:ref:<key>` label
 * (from the caller's dedupe_key, else a title hash). A re-run with the same
 * key is skipped instead of duplicated. The visible `cowork` label makes the
 * tasks easy to find/filter on the ops board.
 */

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function refLabel(assignee: string, title: string, dedupeKey: unknown): string {
  const raw =
    typeof dedupeKey === "string" && dedupeKey.trim()
      ? dedupeKey.trim()
      : createHash("sha1").update(`${assignee}|${title}`).digest("hex").slice(0, 16);
  return `sys:ref:${raw.replace(/[^a-zA-Z0-9_:-]/g, "-").slice(0, 80)}`;
}

export type IngestResult = {
  title: string;
  status: "created" | "skipped" | "error";
  id?: string;
  error?: string;
};

export async function ingestTask(
  supabase: SupabaseClient,
  req: NextRequest | null,
  t: Record<string, unknown>,
  source: "ingest" | "mcp" = "ingest"
): Promise<IngestResult> {
  const title = typeof t.title === "string" ? t.title.trim().slice(0, 300) : "";
  if (!title) return { title: "", status: "error", error: "title is required" };

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
    if (existing) return { title, status: "skipped", id: existing.id as string };

    const callerLabels = Array.isArray(t.labels)
      ? (t.labels as unknown[]).filter((l): l is string => typeof l === "string").map((l) => l.slice(0, 40))
      : [];
    const labels = Array.from(new Set(["cowork", ...callerLabels, ref]));

    // Explicit tenancy: both callers (HTTP ingest + MCP) run on the
    // service-role client, where the ops_tasks org_id column default was the
    // only org assignment. These are machine intake paths with no session, so
    // the org is a deployment fact — same resident-org resolution the public
    // program-intake routes use. Keeps working after the Phase C default drop.
    const org_id = await getResidentOrgId();

    const insert = {
      org_id,
      title,
      description: typeof t.description === "string" ? t.description.slice(0, 4000) : null,
      category,
      priority,
      assigned_to: assignee,
      created_by: assignee,
      due_date,
      labels,
      // Pin only on explicit request. Auto-pinning every ingested task made the
      // ops-landing Today section a permanent copy of the task list (pins never
      // expire), so each undated ingested task rendered twice on /admin/ops.
      pinned_for_today: t.pin_today === true,
    };

    const { data, error } = await supabase.from("ops_tasks").insert(insert).select("id").single();
    if (error || !data) {
      console.error("[ingestTask] insert error:", error?.message);
      return { title, status: "error", error: "insert failed" };
    }
    await audit(req, {
      action: "ops.task.ingest",
      entityType: "ops_task",
      entityId: data.id,
      after: { title, assignee, category, source },
    });
    return { title, status: "created", id: data.id as string };
  } catch (e) {
    console.error("[ingestTask] error:", e);
    return { title, status: "error", error: "unexpected error" };
  }
}
