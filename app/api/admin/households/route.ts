import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Epic D1 — households: group constituents (spouses, family) so giving and
// recognition can roll up together. Membership lives on
// constituents.household_id; this route owns the household record itself.

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * POST /api/admin/households — create a household, optionally seeding members.
 * `member_ids` (constituent uuids) are assigned to the new household.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = str(body.name);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const insert: Record<string, unknown> = { name };
  const salutation = str(body.salutation);
  if (salutation) insert.salutation = salutation;

  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("households").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[households] create failed:", error?.message);
    return NextResponse.json({ error: "Could not create household" }, { status: 500 });
  }

  const memberIds = Array.isArray(body.member_ids)
    ? body.member_ids.filter(isUuid)
    : [];
  if (memberIds.length > 0) {
    const { error: mErr } = await supabase
      .from("constituents")
      .update({ household_id: data.id })
      .in("id", memberIds);
    if (mErr) console.error("[households] member assign failed:", mErr.message);
  }

  await audit(req, {
    action: "fundraising.household.create",
    entityType: "households",
    entityId: data.id,
    after: { ...insert, member_ids: memberIds },
  });
  return NextResponse.json({ id: data.id });
}
