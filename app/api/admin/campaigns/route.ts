import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const insert: Record<string, unknown> = { name };
  if (typeof body?.goal === "number" && body.goal >= 0)
    insert.goal = Math.round(body.goal * 100) / 100;
  if (isISODate(body?.starts_on)) insert.starts_on = body!.starts_on;
  if (isISODate(body?.ends_on)) insert.ends_on = body!.ends_on;

  const { data, error } = await createServerSupabase()
    .from("campaigns")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create campaign failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "fundraising.campaign.create",
    entityType: "campaign",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
