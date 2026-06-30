import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getOrgMentionables } from "@/lib/comments/mentions";

/**
 * @mention autocomplete source: the current org's mentionable members
 * (user_id + display_name). RLS-scoped via the session client inside
 * getOrgMentionables — a caller only ever sees their own org's members.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const members = await getOrgMentionables(ctx.orgId);
  return NextResponse.json({ members });
}
