import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser, ctxHasPermission } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { loadBankStories } from "@/lib/admin/comms/bank-server";
import { fileStory } from "@/lib/admin/comms/capture-server";

/**
 * Story bank: list and capture (V4 Stage D; story-bank branch Phase 1, moved
 * onto requirePermission + the service-role client with an org pin).
 *
 * Capture is forgiving about words (a raw story beats none) and strict about
 * people: anything but an explicit "no one identifiable" files a participant
 * subject with no consent, so the story is held until a grant is on file.
 */

const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function GET(req: NextRequest) {
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const canSee = await ctxHasPermission(gate.ctx, "comms.subjects.read");
  const sp = req.nextUrl.searchParams;
  const { stories, error } = await loadBankStories(getSupabaseAdmin(), gate.ctx.orgId, canSee, {
    status: sp.get("status"),
    q: sp.get("q"),
  });
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ stories, can_see_subjects: canSee });
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (body.happened_on != null && body.happened_on !== "" && !isISODate(body.happened_on)) {
    return NextResponse.json({ error: "happened_on must be YYYY-MM-DD" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body : "";
  const result = await fileStory(getSupabaseAdmin(), ctx.orgId, {
    title: typeof body.title === "string" ? body.title : null,
    body: text,
    outcome: typeof body.outcome === "string" ? body.outcome : null,
    about: typeof body.about === "string" ? body.about : null,
    identifiable: body.identifiable,
    requestConsent: body.request_consent === true,
    capturedBy: (await getAdminUser()) ?? null,
    source: "manual",
    happenedOn: isISODate(body.happened_on) ? body.happened_on : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await audit(req, {
    action: "comms.story.create",
    entityType: "story",
    entityId: result.storyId,
    // Never the name: the audit ledger is not an end-run around the
    // permission that hides it.
    after: { identifiable: result.identifiable, consent_requested: body.request_consent === true },
  });
  return NextResponse.json({ ok: true, id: result.storyId, identifiable: result.identifiable });
}
