import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { isAssignableMember } from "@/lib/admin/owners-server";
import { ASSIGN_MAX_IDS, OWNED_ENTITIES, isOwnedEntity, isUuid, parseOwnerId } from "@/lib/admin/owners";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/assign/{constituents|asks|cohorts|programs|opportunities}
 *   { ids: string[], owner_id: string | null }
 *
 * Sets (or clears) the owner of one record or many: the donor record's owner
 * chip, the Pipeline card and ask detail, cohort detail, and the "Assign to…"
 * bulk action on Donors & Funders all come here (V4 Stage B2).
 *
 * Fences, in order:
 *  1. role: fundraising.write for donors, asks and Pipeline board cards
 *     (opportunities), program.write for cohorts
 *     and programs (requirePermission; the active org comes from it);
 *  2. the new owner must be a member of the ACTIVE org (not a board viewer);
 *  3. every write is pinned to org_id = ctx.orgId, so an id from another org
 *     the caller also belongs to is skipped, never written.
 */
export async function POST(req: NextRequest, { params }: { params: { entity: string } }) {
  const entity = params.entity;
  if (!isOwnedEntity(entity)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const gate = await requirePermission(OWNED_ENTITIES[entity].permission);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(new Set(rawIds.filter(isUuid).map((s) => s.toLowerCase())));
  if (ids.length === 0 || ids.length !== rawIds.length) {
    return NextResponse.json({ error: "Choose at least one record to assign." }, { status: 400 });
  }
  if (ids.length > ASSIGN_MAX_IDS) {
    return NextResponse.json({ error: `Assign at most ${ASSIGN_MAX_IDS} at a time.` }, { status: 400 });
  }

  const ownerId = parseOwnerId(body.owner_id);
  if (ownerId === undefined) return NextResponse.json({ error: "Choose a person to assign." }, { status: 400 });
  if (ownerId && !(await isAssignableMember(ctx.orgId, ownerId))) {
    return NextResponse.json({ error: "That person is not a member of this organization." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from(entity)
    .update({ owner_id: ownerId })
    .eq("org_id", ctx.orgId)
    .in("id", ids)
    .select("id");
  if (error) {
    console.error(`[assign] ${entity} failed:`, error.message);
    return NextResponse.json({ error: "Could not save the owner." }, { status: 500 });
  }
  const updated = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (updated.length === 0) {
    return NextResponse.json({ error: "Those records were not found in this organization." }, { status: 404 });
  }

  await audit(req, {
    action: `assign.${entity}.owner`,
    entityType: entity,
    entityId: updated.length === 1 ? updated[0] : null,
    after: { owner_id: ownerId, ids: updated },
  });

  return NextResponse.json({ ok: true, updated: updated.length, owner_id: ownerId });
}
