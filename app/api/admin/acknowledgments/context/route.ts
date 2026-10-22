import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { loadAckContext } from "@/lib/admin/ackContextLoad";

// GET /api/admin/acknowledgments/context?gift_id=… — everything the Needs-you
// acknowledgment panel shows for one pending gift (specs/needs-you-popout-
// thank-yous.md, PR 3). Read-only, fenced to the active org (loadAckContext):
// a gift outside it is a 404, never a cross-tenant read. `canDraft` says
// whether the AI draft button shows (PR 4): the org holds ai.ack_draft and the
// donor is not do-not-contact.

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const giftId = req.nextUrl.searchParams.get("gift_id") ?? "";
  if (!isUuid(giftId)) return NextResponse.json({ error: "gift_id is required" }, { status: 400 });

  const [res, ents] = await Promise.all([
    loadAckContext(createServerSupabase(), ctx.orgId, giftId),
    getEntitlements(ctx.orgId),
  ]);
  if (res.status === 404) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  if (res.status !== 200) return NextResponse.json({ error: "Couldn't load this gift." }, { status: 500 });
  return NextResponse.json({
    context: res.context,
    canDraft: hasFeature(ents, "ai.ack_draft") && !res.context.donor.doNotContact,
  });
}
