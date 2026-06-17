import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const KINDS = ["school", "district", "nonprofit", "company", "other"] as const;
const STATUSES = ["prospect", "outreach", "pilot", "active", "anchor", "lapsed"] as const;

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const insert: Record<string, unknown> = { name };
  if (KINDS.includes(body?.kind as (typeof KINDS)[number])) insert.kind = body!.kind;
  if (STATUSES.includes(body?.status as (typeof STATUSES)[number])) insert.status = body!.status;
  for (const f of ["city", "region", "domain"] as const) {
    if (typeof body?.[f] === "string" && (body[f] as string).trim())
      insert[f] = (body[f] as string).trim().slice(0, 120);
  }
  if (typeof body?.champion_name === "string" && body.champion_name.trim())
    insert.champion_name = body.champion_name.trim().slice(0, 120);
  if (typeof body?.champion_email === "string" && body.champion_email.includes("@"))
    insert.champion_email = body.champion_email.trim().toLowerCase();
  if (typeof body?.notes === "string" && body.notes.trim())
    insert.notes = body.notes.trim().slice(0, 2000);

  const { data, error } = await getSupabaseAdmin()
    .from("partners")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create partner failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.partner.create",
    entityType: "partner",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
