import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { storableDefinition } from "@/lib/fundraising/segments";

// Saved donor segments: a named filter definition interpreted by
// /api/admin/donors/export and the donors UI.

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await createServerSupabase()
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

// The definition vocabulary (the Donors & Funders filters, "view", and the
// Comms list keys) lives in storableDefinition (lib/fundraising/segments.ts).

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const cleaned = storableDefinition(body?.definition);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const definition = cleaned.definition;

  const { data, error } = await createServerSupabase()
    .from("segments")
    .insert({ org_id: ctx.orgId, name, definition, created_by: (await getAdminUser()) ?? null })
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
