import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import {
  isCategory,
  isProjectStatus,
  isAdminUserId,
  type OpsProject,
} from "@/app/admin/ops/_types/ops";

function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ── GET /api/admin/ops/projects/[id] ───────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ops_projects")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) {
    console.error("[/api/admin/ops/projects/:id GET] error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project: data });
}

// ── PATCH /api/admin/ops/projects/[id] ─────────────────────────────────────

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
    .from("ops_projects")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (readErr) {
    console.error("[/api/admin/ops/projects/:id PATCH read] error:", {
      code: readErr.code,
      message: readErr.message,
    });
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const current = existing as OpsProject;
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
    if (!isCategory(body.category)) {
      return NextResponse.json({ error: "category is invalid" }, { status: 400 });
    }
    updates.category = body.category;
  }
  if ("status" in body) {
    if (!isProjectStatus(body.status)) {
      return NextResponse.json({ error: "status is invalid" }, { status: 400 });
    }
    updates.status = body.status;
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
  if ("due_date" in body) {
    if (body.due_date !== null && !isISODate(body.due_date)) {
      return NextResponse.json({ error: "due_date must be YYYY-MM-DD or null" }, { status: 400 });
    }
    updates.due_date = body.due_date;
  }
  if ("initiative_id" in body) {
    // null detaches; a UUID attaches to a strategic initiative (Phase 2). The
    // FK + RLS on plan_initiatives reject a cross-org/unknown id at write time.
    if (body.initiative_id !== null && !/^[0-9a-f-]{36}$/i.test(String(body.initiative_id))) {
      return NextResponse.json({ error: "initiative_id must be a UUID or null" }, { status: 400 });
    }
    updates.initiative_id = body.initiative_id;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ project: current });
  }

  // Always bump last_touched_at on project edit.
  updates.last_touched_at = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from("ops_projects")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .single();
  if (updErr) {
    console.error("[/api/admin/ops/projects/:id PATCH write] error:", {
      code: updErr.code,
      message: updErr.message,
    });
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
  return NextResponse.json({ project: updated });
}

// ── DELETE /api/admin/ops/projects/[id] ────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  // FK on ops_tasks.project_id is ON DELETE SET NULL — tasks survive,
  // they just lose their project association.
  const { error } = await supabase.from("ops_projects").delete().eq("id", params.id);
  if (error) {
    console.error("[/api/admin/ops/projects/:id DELETE] error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
