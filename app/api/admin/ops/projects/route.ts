import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import {
  isCategory,
  isProjectStatus,
  isAdminUserId,
} from "@/app/admin/ops/_types/ops";

function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ── POST /api/admin/ops/projects ───────────────────────────────────────────

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
  if (!isCategory(body.category)) {
    return NextResponse.json({ error: "category is invalid" }, { status: 400 });
  }
  if (body.assigned_to !== undefined && body.assigned_to !== null && !isAdminUserId(body.assigned_to)) {
    return NextResponse.json({ error: "assigned_to is invalid" }, { status: 400 });
  }
  if (body.due_date !== undefined && body.due_date !== null && !isISODate(body.due_date)) {
    return NextResponse.json({ error: "due_date must be YYYY-MM-DD" }, { status: 400 });
  }

  const insert = {
    title,
    category: body.category,
    description: typeof body.description === "string" ? body.description : null,
    assigned_to: (body.assigned_to as "remi" | "shannon" | null | undefined) ?? null,
    created_by: createdBy,
    due_date: (body.due_date as string | null | undefined) ?? null,
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ops_projects")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    console.error("[/api/admin/ops/projects POST] supabase error:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
  return NextResponse.json({ project: data });
}

// ── GET /api/admin/ops/projects ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const supabase = getSupabaseAdmin();
  let q = supabase.from("ops_projects").select("*", { count: "exact" });

  const status = url.searchParams.get("status");
  if (status && isProjectStatus(status)) q = q.eq("status", status);

  const category = url.searchParams.get("category");
  if (category && isCategory(category)) q = q.eq("category", category);

  const assignee = url.searchParams.get("assigned_to");
  if (assignee === "unassigned") q = q.is("assigned_to", null);
  else if (assignee && isAdminUserId(assignee)) q = q.eq("assigned_to", assignee);

  const search = url.searchParams.get("q");
  if (search && search.trim()) {
    const safe = search.replace(/[,()*%]/g, "").trim();
    if (safe) q = q.ilike("title", `%${safe}%`);
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  q = q.range(offset, offset + limit - 1).order("last_touched_at", { ascending: false });

  const { data, error, count } = await q;
  if (error) {
    console.error("[/api/admin/ops/projects GET] supabase error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }

  return NextResponse.json({ projects: data ?? [], total: count ?? 0 });
}
