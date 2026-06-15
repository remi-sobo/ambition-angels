import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import {
  isTaskCategory,
  isTaskStatus,
  isTaskPriority,
  isAdminUserId,
  type OpsTask,
} from "@/app/admin/ops/_types/ops";

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
  await supabase
    .from("ops_projects")
    .update({ last_touched_at: new Date().toISOString() })
    .eq("id", projectId);
}

// ── GET /api/admin/ops/tasks/[id] ──────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ops_tasks")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    console.error("[/api/admin/ops/tasks/:id GET] supabase error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: data });
}

// ── PATCH /api/admin/ops/tasks/[id] ────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing, error: readErr } = await supabase
    .from("ops_tasks")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (readErr) {
    console.error("[/api/admin/ops/tasks/:id PATCH read] error:", {
      code: readErr.code,
      message: readErr.message,
    });
    return NextResponse.json({ error: "Failed to load task" }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const current = existing as OpsTask;
  const updates: Record<string, unknown> = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.trim() === "") {
      return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 });
    }
    updates.title = body.title.trim();
  }
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return NextResponse.json({ error: "description must be a string or null" }, { status: 400 });
    }
    updates.description = body.description;
  }
  if ("category" in body) {
    if (!isTaskCategory(body.category)) {
      return NextResponse.json({ error: "category is invalid" }, { status: 400 });
    }
    updates.category = body.category;
  }
  if ("priority" in body) {
    if (!isTaskPriority(body.priority)) {
      return NextResponse.json({ error: "priority is invalid" }, { status: 400 });
    }
    updates.priority = body.priority;
  }
  if ("labels" in body) {
    if (!isLabelArray(body.labels)) {
      return NextResponse.json({ error: "labels must be an array of strings" }, { status: 400 });
    }
    updates.labels = body.labels;
  }
  if ("parent_id" in body) {
    if (body.parent_id !== null && typeof body.parent_id !== "string") {
      return NextResponse.json({ error: "parent_id must be a string or null" }, { status: 400 });
    }
    if (body.parent_id === params.id) {
      return NextResponse.json({ error: "a task cannot be its own parent" }, { status: 400 });
    }
    updates.parent_id = body.parent_id;
  }
  if ("status" in body) {
    if (!isTaskStatus(body.status)) {
      return NextResponse.json({ error: "status is invalid" }, { status: 400 });
    }
    updates.status = body.status;
    // completed_at transitions: set on entry to 'done', clear on exit.
    if (body.status === "done" && current.status !== "done") {
      updates.completed_at = new Date().toISOString();
    } else if (body.status !== "done" && current.status === "done") {
      updates.completed_at = null;
    }
  }
  if ("assigned_to" in body) {
    if (body.assigned_to !== null && !isAdminUserId(body.assigned_to)) {
      return NextResponse.json({ error: "assigned_to is invalid" }, { status: 400 });
    }
    updates.assigned_to = body.assigned_to;
  }
  if ("project_id" in body) {
    if (body.project_id !== null && typeof body.project_id !== "string") {
      return NextResponse.json({ error: "project_id must be a string or null" }, { status: 400 });
    }
    updates.project_id = body.project_id;
  }
  if ("due_date" in body) {
    if (body.due_date !== null && !isISODate(body.due_date)) {
      return NextResponse.json({ error: "due_date must be YYYY-MM-DD or null" }, { status: 400 });
    }
    updates.due_date = body.due_date;
  }
  if ("pinned_for_today" in body) updates.pinned_for_today = body.pinned_for_today === true;
  if ("pinned_for_this_week" in body) updates.pinned_for_this_week = body.pinned_for_this_week === true;
  if ("display_order" in body) {
    if (body.display_order !== null && typeof body.display_order !== "number") {
      return NextResponse.json({ error: "display_order must be a number or null" }, { status: 400 });
    }
    updates.display_order = body.display_order;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ task: current });
  }

  const { data: updated, error: updErr } = await supabase
    .from("ops_tasks")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .single();
  if (updErr) {
    console.error("[/api/admin/ops/tasks/:id PATCH write] error:", {
      code: updErr.code,
      message: updErr.message,
    });
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }

  // Touch the project (or projects, if the task moved).
  const newRow = updated as OpsTask;
  await touchProject(supabase, current.project_id);
  if (newRow.project_id !== current.project_id) {
    await touchProject(supabase, newRow.project_id);
  }

  return NextResponse.json({ task: updated });
}

// ── DELETE /api/admin/ops/tasks/[id] ───────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("ops_tasks")
    .select("project_id")
    .eq("id", params.id)
    .maybeSingle();

  const { error } = await supabase.from("ops_tasks").delete().eq("id", params.id);
  if (error) {
    console.error("[/api/admin/ops/tasks/:id DELETE] error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }

  if (existing?.project_id) await touchProject(supabase, existing.project_id);
  return NextResponse.json({ ok: true });
}
