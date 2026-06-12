import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isISODate(body?.meeting_date)) {
    return NextResponse.json({ error: "meeting_date is required" }, { status: 400 });
  }
  const insert: Record<string, unknown> = { meeting_date: body!.meeting_date };
  if (typeof body?.title === "string" && body.title.trim())
    insert.title = body.title.trim().slice(0, 200);

  const { data, error } = await getSupabaseAdmin()
    .from("board_meetings")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create board meeting failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "board.meeting.create",
    entityType: "board_meeting",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
