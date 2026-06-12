import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * PATCH — agenda / attendance / minutes edits while in draft; `approve: true`
 * freezes the record (minutes_status=approved + approved_at). Approved
 * meetings reject all further content edits — minutes are the permanent
 * legal record (retention class: permanent).
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
    .from("board_meetings")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, unknown> = {};

  if (body.approve === true) {
    if (before.minutes_status === "approved") {
      return NextResponse.json({ error: "Already approved" }, { status: 400 });
    }
    update.minutes_status = "approved";
    update.approved_at = new Date().toISOString();
  } else {
    if (before.minutes_status === "approved") {
      return NextResponse.json(
        { error: "Approved minutes are immutable" },
        { status: 400 }
      );
    }
    if (Array.isArray(body.agenda)) {
      update.agenda = body.agenda
        .filter((a) => a && typeof a === "object" && typeof (a as Record<string, unknown>).title === "string")
        .slice(0, 50)
        .map((a) => {
          const item = a as Record<string, unknown>;
          return {
            title: String(item.title).slice(0, 300),
            kind: item.kind === "consent" ? "consent" : "normal",
            notes: typeof item.notes === "string" ? item.notes.slice(0, 2000) : "",
          };
        });
    }
    if (Array.isArray(body.attendance)) {
      update.attendance = body.attendance
        .filter(
          (a) =>
            a && typeof a === "object" &&
            typeof (a as Record<string, unknown>).member_id === "string"
        )
        .slice(0, 100)
        .map((a) => {
          const row = a as Record<string, unknown>;
          return { member_id: String(row.member_id), present: row.present === true };
        });
    }
    if (typeof body.quorum_met === "boolean") update.quorum_met = body.quorum_met;
    if ("minutes" in body)
      update.minutes =
        body.minutes === null || body.minutes === ""
          ? null
          : typeof body.minutes === "string"
          ? body.minutes.slice(0, 50000)
          : undefined;
    if (update.minutes === undefined) delete update.minutes;
    if (typeof body.title === "string" && body.title.trim())
      update.title = body.title.trim().slice(0, 200);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabase.from("board_meetings").update(update).eq("id", params.id);
  if (error) {
    console.error("Update board meeting failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: body.approve === true ? "board.minutes.approved" : "board.meeting.update",
    entityType: "board_meeting",
    entityId: params.id,
    before,
    after: update,
  });
  return NextResponse.json({ ok: true });
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
    .from("board_meetings")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.minutes_status === "approved") {
    return NextResponse.json(
      { error: "Approved meetings are part of the permanent record" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("board_meetings").delete().eq("id", params.id);
  if (error) {
    console.error("Delete board meeting failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "board.meeting.delete",
    entityType: "board_meeting",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
