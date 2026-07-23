import { NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { getDataAge } from "@/lib/admin/dataAge";

// Thin wrapper over the data-age source of truth (lib/admin/dataAge.ts) so the
// client sidebar can render the loud staleness indicator. Server code (e.g. the
// Phase 4 briefing engine) imports getDataAge() directly instead.
export const dynamic = "force-dynamic";

export async function GET() {
  // Data-age reports the AA HubSpot spine's freshness — an AA-site surface,
  // fenced like the sync route so other tenants can't read it.
  const ent = await requireEntitlement("aa.hubspot_mirror");
  if (!ent.ok) {
    return NextResponse.json({ error: ent.error }, { status: ent.status });
  }
  return NextResponse.json(await getDataAge(ent.ctx.orgId));
}
