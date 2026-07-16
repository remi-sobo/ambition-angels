import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const KINDS = [
  "form_990", "state_charitable", "corporate_report", "employment_tax",
  "insurance", "policy", "public_disclosure", "contract", "custom",
] as const;
const RECURS = ["annual", "quarterly", "biennial", "none"] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Checklist lives as jsonb [{id, text, done}] on the item (details panel on
// /admin/compliance). The client always sends the full replacement array.
function parseChecklist(v: unknown): Array<{ id: string; text: string; done: boolean }> | null {
  if (!Array.isArray(v) || v.length > 100) return null;
  const out: Array<{ id: string; text: string; done: boolean }> = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, text, done } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof text !== "string" || typeof done !== "boolean") return null;
    if (!text.trim()) continue;
    out.push({ id: id.slice(0, 40), text: text.trim().slice(0, 300), done });
  }
  return out;
}

function rollForward(due: string, recur: string): string {
  const d = new Date(`${due}T00:00:00Z`);
  if (recur === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3);
  else if (recur === "biennial") d.setUTCFullYear(d.getUTCFullYear() + 2);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * PATCH — edits + the calendar engine: marking a recurring item `filed`
 * stamps last_filed_at, rolls due_date forward one period, and resets
 * status to `upcoming`. Non-recurring items just become `filed`.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("compliance_items")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (body.status === "filed") {
    update.last_filed_at = new Date().toISOString();
    if (before.recur !== "none") {
      update.due_date = rollForward(before.due_date, before.recur);
      update.status = "upcoming";
    } else {
      update.status = "filed";
    }
  } else if (["upcoming", "in_progress", "waived"].includes(body.status as string)) {
    update.status = body.status;
  }
  if (isISODate(body.due_date)) update.due_date = body.due_date;
  // Core-field edits (Edit action): title, kind, jurisdiction, recur.
  if (typeof body.title === "string" && body.title.trim())
    update.title = body.title.trim().slice(0, 200);
  if (KINDS.includes(body.kind as (typeof KINDS)[number])) update.kind = body.kind;
  if (RECURS.includes(body.recur as (typeof RECURS)[number])) update.recur = body.recur;
  if ("jurisdiction" in body)
    update.jurisdiction =
      body.jurisdiction === null || body.jurisdiction === ""
        ? null
        : typeof body.jurisdiction === "string"
        ? body.jurisdiction.trim().slice(0, 60)
        : undefined;
  if (update.jurisdiction === undefined) delete update.jurisdiction;
  if ("assigned_to" in body)
    update.assigned_to =
      body.assigned_to === null || body.assigned_to === ""
        ? null
        : typeof body.assigned_to === "string"
        ? body.assigned_to.trim().slice(0, 60)
        : undefined;
  if (update.assigned_to === undefined) delete update.assigned_to;
  if ("notes" in body)
    update.notes =
      body.notes === null || body.notes === ""
        ? null
        : typeof body.notes === "string"
        ? body.notes.slice(0, 2000)
        : undefined;
  if (update.notes === undefined) delete update.notes;
  if ("checklist" in body) {
    const checklist = parseChecklist(body.checklist);
    if (checklist === null) {
      return NextResponse.json({ error: "Invalid checklist" }, { status: 400 });
    }
    update.checklist = checklist;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("compliance_items")
    .update(update)
    .eq("id", params.id);
  if (error) {
    console.error("Update compliance item failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: body.status === "filed" ? "compliance.item.filed" : "compliance.item.update",
    entityType: "compliance_item",
    entityId: params.id,
    before,
    after: update,
  });
  return NextResponse.json({ ok: true, rolled: body.status === "filed" && before.recur !== "none" });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("compliance_items")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("compliance_items").delete().eq("id", params.id);
  if (error) {
    console.error("Delete compliance item failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "compliance.item.delete",
    entityType: "compliance_item",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
