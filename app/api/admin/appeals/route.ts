import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = body && typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const campaignId =
    body && typeof body.campaign_id === "string" && /^[0-9a-f-]{36}$/i.test(body.campaign_id)
      ? body.campaign_id
      : null;
  if (!name || !campaignId) {
    return NextResponse.json({ error: "name and campaign_id are required" }, { status: 400 });
  }

  const insert: Record<string, unknown> = { org_id: ctx.orgId, name, campaign_id: campaignId };
  if (typeof body?.source_code === "string" && body.source_code.trim())
    insert.source_code = body.source_code.trim().slice(0, 60);

  const { data, error } = await createServerSupabase()
    .from("appeals")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create appeal failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "fundraising.appeal.create",
    entityType: "appeal",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
