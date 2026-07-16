import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

const createSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).optional(),
  meeting_type_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (parsed.data.end_date < parsed.data.start_date) {
    return NextResponse.json(
      { error: "end_date must be on or after start_date" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("blackouts")
    .insert({
      org_id: ctx.orgId,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      reason: parsed.data.reason ?? null,
      meeting_type_ids: parsed.data.meeting_type_ids ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ blackout: data });
}
