import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  prep_notes: z.string().max(500).nullable().optional(),
  who_its_for: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  duration_minutes: z.number().int().min(5).max(240).optional(),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  min_notice_hours: z.number().int().min(0).max(720).optional(),
  max_advance_days: z.number().int().min(1).max(365).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  location_options: z.array(z.enum(["video", "in_person"])).min(1).optional(),
  default_in_person_address: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("meeting_types")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ meetingType: data });
}
