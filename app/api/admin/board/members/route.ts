import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const ROLES = ["chair", "vice_chair", "secretary", "treasurer", "member"] as const;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * POST — add a board member. An exact email match auto-links the
 * constituent record so giving status reads real gifts.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const insert: Record<string, unknown> = { org_id: ctx.orgId, name };
  const email =
    typeof body?.email === "string" && body.email.includes("@")
      ? body.email.trim().toLowerCase()
      : null;
  if (email) {
    insert.email = email;
    const { data: match } = await supabase
      .from("constituents")
      .select("id")
      .eq("org_id", ctx.orgId)
      .contains("emails", [email])
      .limit(1)
      .maybeSingle();
    if (match) insert.constituent_id = match.id;
  }
  if (ROLES.includes(body?.officer_role as (typeof ROLES)[number]))
    insert.officer_role = body!.officer_role;
  if (isISODate(body?.term_start)) insert.term_start = body!.term_start;
  if (isISODate(body?.term_end)) insert.term_end = body!.term_end;
  if (typeof body?.term_number === "number" && body.term_number >= 1)
    insert.term_number = Math.round(body.term_number);

  const { data, error } = await supabase
    .from("board_members")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create board member failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "board.member.create",
    entityType: "board_member",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id, linked: !!insert.constituent_id });
}
