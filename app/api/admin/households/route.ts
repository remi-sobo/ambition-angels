import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
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
  // org_id is set explicitly from session context — never the column default.
  // Leaning on the default routes a second tenant's households into AA (the
  // "org_id default trap"); see specs/household-management.md.
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = str(body.name);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const memberIds = Array.isArray(body.member_ids)
    ? Array.from(new Set(body.member_ids.filter(isUuid)))
    : [];

  const supabase = createServerSupabase();

  // Validate every member is visible to the caller (RLS scopes reads to the
  // org). Anything not returned is outside the org or doesn't exist — reject
  // loudly with the offending ids rather than silently no-op'ing the assign.
  if (memberIds.length > 0) {
    const { data: owned, error: vErr } = await supabase
      .from("constituents")
      .select("id")
      .in("id", memberIds);
    if (vErr) {
      console.error("[households] member validation failed:", vErr.message);
      return NextResponse.json({ error: "Could not validate members" }, { status: 500 });
    }
    const ownedIds = new Set((owned ?? []).map((r) => (r as { id: string }).id));
    const rejected = memberIds.filter((id) => !ownedIds.has(id));
    if (rejected.length > 0) {
      return NextResponse.json(
        { error: "Some members are not in your organization", rejected },
        { status: 422 }
      );
    }
  }

  const insert: Record<string, unknown> = { org_id: ctx.orgId, name };
  const salutation = str(body.salutation);
  if (salutation) insert.salutation = salutation;

  const { data, error } = await supabase.from("households").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[households] create failed:", error?.message);
    return NextResponse.json({ error: "Could not create household" }, { status: 500 });
  }

  if (memberIds.length > 0) {
    const { error: mErr } = await supabase
      .from("constituents")
      .update({ household_id: data.id })
      .in("id", memberIds);
    if (mErr) {
      // Members were validated above, so this is a real write failure, not a
      // scope miss. Surface it instead of returning a misleading 200.
      console.error("[households] member assign failed:", mErr.message);
      return NextResponse.json(
        { error: "Household created but members could not be assigned", id: data.id },
        { status: 500 }
      );
    }
  }

  await audit(req, {
    action: "fundraising.household.create",
    entityType: "households",
    entityId: data.id,
    after: { ...insert, member_ids: memberIds },
  });
  return NextResponse.json({ id: data.id });
}
