import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { thisMonday } from "@/lib/admin/ops/week";
import {
  isTaskCategory,
  isTaskStatus,
  isTaskPriority,
  isAdminUserId,
  type OpsTask,
} from "@/app/admin/ops/_types/ops";

// ── Helpers ────────────────────────────────────────────────────────────────

function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Entity-link vocabulary — mirrors the DB CHECK
// (ops_tasks_linked_entity_type_check, last widened by
// prospect_task_links.sql to match the spine registry).
const LINK_TYPES = [
  "partner", "constituent", "opportunity", "volunteer", "milestone",
  "student", "cohort", "application", "program", "grant", "document", "metric",
  "fr_prospects",
] as const;

function isLabelArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

async function touchProject(
  supabase: SupabaseClient,
  projectId: string | null
) {
  if (!projectId) return;
  const now = new Date().toISOString();
  // updated_at fires via trigger; we set last_touched_at explicitly here
  // because the trigger only handles updated_at.
  await supabase
    .from("ops_projects")
    .update({ last_touched_at: now })
    .eq("id", projectId);
}

// ── POST /api/admin/ops/tasks ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const createdBy = await getAdminUser();
  if (!createdBy) {
    return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!isTaskCategory(body.category)) {
    return NextResponse.json({ error: "category is invalid" }, { status: 400 });
  }
  if (body.priority !== undefined && body.priority !== null && !isTaskPriority(body.priority)) {
    return NextResponse.json({ error: "priority is invalid" }, { status: 400 });
  }
  if (body.labels !== undefined && body.labels !== null && !isLabelArray(body.labels)) {
    return NextResponse.json({ error: "labels must be an array of strings" }, { status: 400 });
  }
  if (body.parent_id !== undefined && body.parent_id !== null && typeof body.parent_id !== "string") {
    return NextResponse.json({ error: "parent_id must be a string" }, { status: 400 });
  }
  if (body.assigned_to !== undefined && body.assigned_to !== null && !isAdminUserId(body.assigned_to)) {
    return NextResponse.json({ error: "assigned_to is invalid" }, { status: 400 });
  }
  if (body.due_date !== undefined && body.due_date !== null && !isISODate(body.due_date)) {
    return NextResponse.json({ error: "due_date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (body.planned_week !== undefined && body.planned_week !== null && !isISODate(body.planned_week)) {
    return NextResponse.json({ error: "planned_week must be YYYY-MM-DD" }, { status: 400 });
  }
  if (body.project_id !== undefined && body.project_id !== null && typeof body.project_id !== "string") {
    return NextResponse.json({ error: "project_id must be a string" }, { status: 400 });
  }
  const linkType = body.linked_entity_type;
  if (
    linkType !== undefined &&
    linkType !== null &&
    !LINK_TYPES.includes(linkType as (typeof LINK_TYPES)[number])
  ) {
    return NextResponse.json({ error: "linked_entity_type is invalid" }, { status: 400 });
  }
  if (linkType && (typeof body.linked_entity_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.linked_entity_id))) {
    return NextResponse.json({ error: "linked_entity_id must be a uuid" }, { status: 400 });
  }

  const insert = {
    // Set org_id from session — never ride the AA column default (the org_id trap).
    org_id: ctx.orgId,
    title,
    description: typeof body.description === "string" ? body.description : null,
    category: body.category,
    priority: (body.priority as string | undefined) ?? "medium",
    parent_id: (body.parent_id as string | null | undefined) ?? null,
    labels: isLabelArray(body.labels) ? body.labels : [],
    project_id: (body.project_id as string | null | undefined) ?? null,
    assigned_to: (body.assigned_to as "remi" | "shannon" | null | undefined) ?? null,
    created_by: createdBy,
    due_date: (body.due_date as string | null | undefined) ?? null,
    pinned_for_today: body.pinned_for_today === true,
    pinned_for_this_week: body.pinned_for_this_week === true,
    // Keep planned_week in sync with the week pin (explicit value wins).
    planned_week:
      (body.planned_week as string | null | undefined) ??
      (body.pinned_for_this_week === true ? thisMonday() : null),
    linked_entity_type: (linkType as string | null | undefined) ?? null,
    linked_entity_id: linkType ? (body.linked_entity_id as string) : null,
    linked_label: typeof body.linked_label === "string" ? body.linked_label.slice(0, 200) : null,
  };

  // Session client → RLS enforces org membership + ops.write (no service-role
  // bypass): a user without ops.write, or in another org, is blocked by the DB.
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("ops_tasks")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    console.error("[/api/admin/ops/tasks POST] supabase error:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }

  await touchProject(supabase, (data as OpsTask).project_id);
  return NextResponse.json({ task: data });
}

// ── GET /api/admin/ops/tasks ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  // Session client → reads are RLS-scoped (ops.read, org-bound), not service-role.
  const supabase = createServerSupabase();
  let q = supabase.from("ops_tasks").select("*", { count: "exact" });

  const status = url.searchParams.get("status");
  if (status) {
    if (status === "open") {
      // virtual filter: anything not done
      q = q.neq("status", "done");
    } else if (isTaskStatus(status)) {
      q = q.eq("status", status);
    }
  }
  const category = url.searchParams.get("category");
  if (category && isTaskCategory(category)) q = q.eq("category", category);

  const priority = url.searchParams.get("priority");
  if (priority && isTaskPriority(priority)) q = q.eq("priority", priority);

  const parentId = url.searchParams.get("parent_id");
  if (parentId === "none") q = q.is("parent_id", null);
  else if (parentId) q = q.eq("parent_id", parentId);

  const assignee = url.searchParams.get("assigned_to");
  if (assignee === "unassigned") q = q.is("assigned_to", null);
  else if (assignee && isAdminUserId(assignee)) q = q.eq("assigned_to", assignee);

  const projectId = url.searchParams.get("project_id");
  if (projectId === "none") q = q.is("project_id", null);
  else if (projectId) q = q.eq("project_id", projectId);

  // CRM-linked filter (partner / constituent / prospect profile task lists).
  const linkType = url.searchParams.get("linked_entity_type");
  if (linkType && LINK_TYPES.includes(linkType as (typeof LINK_TYPES)[number])) {
    q = q.eq("linked_entity_type", linkType);
  }
  const linkId = url.searchParams.get("linked_entity_id");
  if (linkId && /^[0-9a-f-]{36}$/i.test(linkId)) q = q.eq("linked_entity_id", linkId);

  if (url.searchParams.get("pinned_for_today") === "true") {
    q = q.eq("pinned_for_today", true);
  }
  if (url.searchParams.get("pinned_for_this_week") === "true") {
    q = q.eq("pinned_for_this_week", true);
  }

  const dueFrom = url.searchParams.get("due_date_from");
  if (dueFrom && isISODate(dueFrom)) q = q.gte("due_date", dueFrom);
  const dueTo = url.searchParams.get("due_date_to");
  if (dueTo && isISODate(dueTo)) q = q.lte("due_date", dueTo);

  const search = url.searchParams.get("q");
  if (search && search.trim()) {
    const safe = search.replace(/[,()*%]/g, "").trim();
    if (safe) q = q.ilike("title", `%${safe}%`);
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  q = q.range(offset, offset + limit - 1).order("due_date", { ascending: true, nullsFirst: false });

  const { data, error, count } = await q;
  if (error) {
    console.error("[/api/admin/ops/tasks GET] supabase error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }

  return NextResponse.json({ tasks: data ?? [], total: count ?? 0 });
}
