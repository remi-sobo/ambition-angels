import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is string =>
  typeof v === "string" && /^\d{2}:\d{2}$/.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isISODate(body?.session_date)) {
    return NextResponse.json({ error: "session_date (YYYY-MM-DD) is required" }, { status: 400 });
  }

  // A session lives in its cohort's org — derive, never default.
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: cohort } = await getSupabaseAdmin()
    .from("cohorts")
    .select("org_id")
    .eq("org_id", ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!cohort) return NextResponse.json({ error: "Cohort not found" }, { status: 404 });

  const insert: Record<string, unknown> = {
    org_id: cohort.org_id,
    cohort_id: params.id,
    session_date: body!.session_date,
  };
  for (const f of ["title", "location"] as const) {
    if (typeof body?.[f] === "string" && (body[f] as string).trim())
      insert[f] = (body[f] as string).trim().slice(0, 160);
  }
  for (const f of ["starts_at", "ends_at"] as const) {
    if (isTime(body?.[f])) insert[f] = body![f];
  }

  const { data, error } = await getSupabaseAdmin()
    .from("cohort_sessions")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create session failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.session.create",
    entityType: "cohort_session",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
