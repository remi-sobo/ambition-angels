import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser, ctxHasPermission } from "@/lib/admin/auth";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import { loadEdition } from "@/lib/admin/comms/editions-server";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { compileEdition, type CompileMetric, type CompileStory } from "@/lib/comms/compile";
import { storyVerdicts } from "@/lib/comms/story-gate";

/**
 * Compile an edition into an email DRAFT on the existing Gmail sender (V4
 * Stage D; story-bank branch Phase 5).
 *
 * GET previews the text and what would block it. POST writes (or rewrites)
 * the one email_campaigns draft this edition owns and, when given, attaches
 * the audience (a saved segment in this org). It never queues or sends: the
 * draft then goes through Comms → Emails' reviewed send, which shows the live
 * recipient count and re-checks consent at queue time and again in the worker
 * for every copy (lib/comms/story-gate.ts campaignStoryBlock).
 *
 * Consent: only stories the gate calls usable reach compileEdition's story
 * map; a slot whose story is not in it blocks compile with a named reason.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const subjectFor = (e: { subject: string | null; title: string }) => (e.subject ?? "").trim() || e.title;

async function prepare(orgId: string, editionId: string) {
  const db = getSupabaseAdmin();
  const detail = await loadEdition(db, orgId, editionId);
  if (!detail) return null;
  const storyIds = Array.from(new Set(detail.slots.map((s) => s.story_id).filter((v): v is string => !!v)));
  const metricIds = Array.from(new Set(detail.slots.flatMap((s) => s.metric_ids ?? [])));

  const verdicts = await storyVerdicts(db, orgId, storyIds);
  const usable = storyIds.filter((id) => verdicts.get(id)?.publishable);
  const [storiesRes, catalog] = await Promise.all([
    usable.length > 0
      ? db.from("stories").select("id, title, body, outcome").eq("org_id", orgId).in("id", usable)
      : Promise.resolve({ data: [] as CompileStory[] }),
    metricIds.length > 0 ? getMetricCatalog() : Promise.resolve([]),
  ]);
  const storiesById = new Map(((storiesRes.data ?? []) as CompileStory[]).map((s) => [s.id, s]));
  const metricsById = new Map(
    catalog
      .filter((m) => metricIds.includes(m.id))
      .map((m): [string, CompileMetric] => [
        m.id,
        { id: m.id, name: m.name, unit: m.unit, latest: m.latest?.value ?? null, captured_on: m.latest?.captured_on ?? null, stale: m.stale },
      ]),
  );
  const result = compileEdition({ slots: detail.slots, storiesById, metricsById });
  // Say WHICH story and why, not only that a slot is blocked.
  const reasons = storyIds
    .map((id) => verdicts.get(id))
    .filter((v) => v && !v.publishable)
    .map((v) => `"${v!.title || "A story"}": ${v!.reason}`);
  return { db, detail, result: { ...result, blocked: [...result.blocked, ...reasons] } };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const p = await prepare(gate.ctx.orgId, params.id);
  if (!p) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
  return NextResponse.json({ body: p.result.body, warnings: p.result.warnings, blocked: p.result.blocked, subject: subjectFor(p.detail.edition) });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const gate = await requirePermission("comms.manage", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  // An email draft lives with the sender's tables (fundraising.write RLS).
  if (!(await ctxHasPermission(ctx, "fundraising.write"))) {
    return NextResponse.json({ error: "Making the email draft needs fundraising access. Ask an owner or admin." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const p = await prepare(ctx.orgId, params.id);
  if (!p) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
  const { db, detail, result } = p;
  if (detail.edition.status === "sent") return NextResponse.json({ error: "This edition has already gone out." }, { status: 409 });
  if (result.blocked.length > 0) {
    return NextResponse.json({ error: result.blocked[0], blocked: result.blocked }, { status: 409 });
  }

  let segmentId: string | null = null;
  if (body.segment_id != null && body.segment_id !== "") {
    if (!isUuid(body.segment_id)) return NextResponse.json({ error: "Invalid segment_id" }, { status: 400 });
    const { data: seg } = await db.from("segments").select("id").eq("id", body.segment_id).eq("org_id", ctx.orgId).maybeSingle();
    if (!seg) return NextResponse.json({ error: "That audience wasn't found." }, { status: 404 });
    segmentId = body.segment_id;
  }

  const fields: Record<string, unknown> = { name: detail.edition.title, subject: subjectFor(detail.edition), body: result.body };
  if (segmentId) fields.segment_id = segmentId;

  let campaignId: string | null = null;
  if (detail.edition.email_campaign_id) {
    const { data: existing } = await db
      .from("email_campaigns")
      .select("id, status")
      .eq("id", detail.edition.email_campaign_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (existing && existing.status !== "draft") {
      return NextResponse.json({ error: "That email has already been scheduled or sent, so it can't be rewritten." }, { status: 409 });
    }
    if (existing) {
      const { data: updated, error } = await db
        .from("email_campaigns")
        .update(fields)
        .eq("id", existing.id)
        .eq("org_id", ctx.orgId)
        .eq("status", "draft")
        .select("id")
        .maybeSingle();
      if (error) return NextResponse.json({ error: "Could not update the email draft." }, { status: 500 });
      campaignId = (updated?.id as string | undefined) ?? null;
    }
  }
  if (!campaignId) {
    const { data: campaign, error } = await db
      .from("email_campaigns")
      .insert({ org_id: ctx.orgId, ...fields, status: "draft", created_by: (await getAdminUser()) ?? null })
      .select("id")
      .single();
    if (error || !campaign) return NextResponse.json({ error: "Could not create the email draft." }, { status: 500 });
    campaignId = campaign.id as string;
  }

  await db.from("comms_editions").update({ email_campaign_id: campaignId, status: "compiled" }).eq("id", params.id).eq("org_id", ctx.orgId);
  await audit(req, {
    action: "comms.edition.compile",
    entityType: "comms_edition",
    entityId: params.id,
    after: { email_campaign_id: campaignId, chars: result.body.length, segment_id: segmentId },
  });
  return NextResponse.json({ ok: true, campaign_id: campaignId, warnings: result.warnings });
}
