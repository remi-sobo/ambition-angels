import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Saved donor segments: a named filter definition interpreted by
// /api/admin/donors/export and the donors UI.

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("segments")
    .select("id, name, definition, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("List segments failed:", error.message);
    return NextResponse.json({ error: "List failed" }, { status: 500 });
  }
  return NextResponse.json({ segments: data ?? [] });
}

const FILTER_KEYS = ["q", "type", "source", "tag", "min_total", "since"] as const;

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const definition: Record<string, string> = {};
  const raw = (body?.definition ?? {}) as Record<string, unknown>;
  for (const k of FILTER_KEYS) {
    const v = raw[k];
    if (typeof v === "string" && v.trim() !== "") definition[k] = v.trim().slice(0, 200);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("segments")
    .insert({ name, definition, created_by: (await getAdminUser()) ?? null })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create segment failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "fundraising.segment.create",
    entityType: "segment",
    entityId: data.id,
    after: { name, definition },
  });
  return NextResponse.json({ id: data.id });
}
