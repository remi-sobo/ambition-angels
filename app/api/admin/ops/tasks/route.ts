import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
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

function isLabelArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

async function touchProject(
  supabase: ReturnType<typeof getSupabaseAdmin>,
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
  if (!await isAuthed()) {
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
  if (body.project_id !== undefined && body.project_id !== null && typeof body.project_id !== "string") {
    return NextResponse.json({ error: "project_id must be a string" }, { status: 400 });
  }

  const insert = {
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
  };

  const supabase = getSupabaseAdmin();
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
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const supabase = getSupabaseAdmin();
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
