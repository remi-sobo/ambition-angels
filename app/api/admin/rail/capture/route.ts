import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";

/**
 * Quick-capture from the right rail's fast lane. Writes through the SESSION
 * client so the ops.write RLS policy applies — no service-role in the rail.
 * Defaults to a task (category "other"); the capture chip's entity, when set,
 * becomes the linked_entity so the task is auto-filed against what you're
 * viewing. org_id is set from the session (not the column's AA default) so it's
 * correct per tenant.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const createdBy = await getAdminUser();
  if (!createdBy) return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = body && typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // Optional CRM link — partner org / constituent, set together.
  let linkedType: "partner" | "constituent" | null = null;
  let linkedId: string | null = null;
  let linkedLabel: string | null = null;
  const t = body?.linked_entity_type;
  if (t === "partner" || t === "constituent") {
    const id = body?.linked_entity_id;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "linked_entity_id must be a uuid" }, { status: 400 });
    }
    linkedType = t;
    linkedId = id;
    linkedLabel = typeof body?.linked_label === "string" ? body.linked_label.slice(0, 200) : null;
  }

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("ops_tasks")
    .insert({
      title,
      category: "other",
      org_id: ctx.orgId,
      created_by: createdBy,
      assigned_to: createdBy,
      linked_entity_type: linkedType,
      linked_entity_id: linkedId,
      linked_label: linkedLabel,
    })
    .select("id, title, linked_label")
    .single();

  if (error) {
    console.error("[/api/admin/rail/capture POST] supabase error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ task: data });
}
