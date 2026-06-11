import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";

// Postgres error code for "relation does not exist" — surfaced when the
// demoday_notes migration hasn't been applied yet. We treat it as "no notes
// yet" so the tracker still renders all attendees instead of erroring.
const UNDEFINED_TABLE = "42P01";

const STATUSES = ["want_to_connect", "contacted", "following_up"] as const;
type Status = (typeof STATUSES)[number];

function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

// ── GET /api/admin/demoday/notes ────────────────────────────────────────────
// Returns every saved note row. The attendee roster itself is static
// (lib/demoday/attendees.ts); this only carries the mutable note/star/status.

export async function GET() {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("demoday_notes")
    .select("attendee_key, note, starred, status, updated_by, updated_at");

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return NextResponse.json({ notes: [], tableMissing: true });
    }
    console.error("[/api/admin/demoday/notes GET] supabase error:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }

  return NextResponse.json({ notes: data ?? [] });
}

// ── PUT /api/admin/demoday/notes ────────────────────────────────────────────
// Upsert the full note state for one attendee. The client always sends the
// complete {note, starred, status} so the upsert never partially clobbers a
// row.

export async function PUT(req: NextRequest) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const updatedBy = await getAdminUser();
  if (!updatedBy) {
    return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const attendeeKey = typeof body.attendee_key === "string" ? body.attendee_key.trim() : "";
  if (!attendeeKey) {
    return NextResponse.json({ error: "attendee_key is required" }, { status: 400 });
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "note must be a string or null" }, { status: 400 });
  }
  if (body.status !== undefined && body.status !== null && !isStatus(body.status)) {
    return NextResponse.json({ error: "status is invalid" }, { status: 400 });
  }

  const noteRaw = typeof body.note === "string" ? body.note.trim() : "";
  const row = {
    attendee_key: attendeeKey,
    note: noteRaw === "" ? null : noteRaw,
    starred: body.starred === true,
    status: (body.status as Status | null | undefined) ?? null,
    updated_by: updatedBy,
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("demoday_notes")
    .upsert(row, { onConflict: "attendee_key" })
    .select("attendee_key, note, starred, status, updated_by, updated_at")
    .single();

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return NextResponse.json(
        { error: "demoday_notes table not found — apply the migration first." },
        { status: 503 }
      );
    }
    console.error("[/api/admin/demoday/notes PUT] supabase error:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }

  return NextResponse.json({ note: data });
}
