import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { audit } from "@/lib/audit";
import { generateText, AIKeyMissingError } from "@/lib/ai/gateway";
import { logAICall } from "@/lib/ai/ledger";
import { orgOverAICap } from "@/lib/ai/cap";
import {
  buildComposerPrompt,
  CHANNEL_SPECS,
  COMPOSER_SYSTEM,
  isChannel,
  provenanceNote,
} from "@/lib/comms/channels";
import {
  leaksAnyName,
  redactStoryForModel,
  type GroundingMetric,
  type RedactableSubject,
} from "@/lib/comms/redact";
import { loadSubjectNames } from "@/lib/comms/compose-server";

/**
 * The composer (specs/comms-module.md §6.4, §7.5, Phase 3).
 *
 * This is the ONLY route in the product that sends story text to a model, and
 * it is built as a series of refusals:
 *
 *   1. comms.manage, or 403.
 *   2. The ai.reed entitlement, or 402 — the Grow-tier boundary. Base tier
 *      still gets the whole story bank; it just writes its own copy.
 *   3. The org's monthly AI spend backstop, or 429.
 *   4. The story must be in v_publishable_stories — the RLS-enforced view, not
 *      an app-side check. A story whose consent lapsed is not there, so it
 *      cannot be drafted from even by a caller who guessed its id.
 *   5. Redaction, then a last-line assertion that no name survived it. A
 *      failure there is a 500 with a log line, never a request that goes out
 *      anyway.
 *
 * Everything runs through lib/ai/gateway so this surface shares the model
 * choice, prompt caching, voice sweep, and spend ledger with every other AI
 * call in the product.
 */

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // ── 2. Tier gate first: it resolves the org and gives the upsell status. ──
  const ent = await requireEntitlement("ai.reed");
  if (!ent.ok) {
    return NextResponse.json(
      {
        error:
          ent.status === 402
            ? "AI drafting is part of Bloom Grow. You can still write this section yourself from the story."
            : ent.error,
      },
      { status: ent.status },
    );
  }
  const ctx = ent.ctx;
  const supabase = createServerSupabase();

  // ── 1. The module permission. ────────────────────────────────────────────
  if (!(await hasPermission(supabase, ctx.orgId, "comms.manage"))) {
    return NextResponse.json({ error: "You don't have access to Comms." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isChannel(body.channel)) {
    return NextResponse.json({ error: "Pick a channel to write for." }, { status: 400 });
  }
  const channel = body.channel;
  const metricIds = Array.isArray(body.metric_ids) ? body.metric_ids.filter(isUuid) : [];

  // ── 3. Spend backstop. Fail-open on a read hiccup, closed when over. ─────
  const cap = await orgOverAICap(supabase, ctx.orgId);
  if (cap.over) {
    return NextResponse.json(
      {
        error: `This org has reached its monthly AI limit ($${cap.capUsd}). Drafting is paused until next month.`,
      },
      { status: 429 },
    );
  }

  // ── 4. Publishable only. The VIEW is the boundary, not a helper. ──────────
  const { data: story } = await supabase
    .from("v_publishable_stories")
    .select("id, title, body, outcome")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!story) {
    return NextResponse.json(
      {
        error:
          "This story isn't available to draft from. It needs to be approved, and everyone in it needs current consent.",
      },
      { status: 403 },
    );
  }

  // Subjects, with the real names from their linked records, so the redactor
  // can catch a name someone typed into the prose.
  const subjects: RedactableSubject[] = await loadSubjectNames(supabase, ctx.orgId, params.id);

  // Metrics resolved HERE, server-side. The model receives values as flat
  // prose and never anything resembling a query capability.
  const metrics: GroundingMetric[] = [];
  if (metricIds.length > 0) {
    const [{ data: defs }, { data: snaps }] = await Promise.all([
      supabase
        .from("metric_definitions")
        .select("id, name, unit")
        .eq("org_id", ctx.orgId)
        .in("id", metricIds),
      supabase
        .from("metric_snapshots")
        .select("id, metric_id, value, captured_on")
        .eq("org_id", ctx.orgId)
        .in("metric_id", metricIds)
        .order("captured_on", { ascending: false }),
    ]);
    const latest = new Map<string, { id: string; value: number; captured_on: string }>();
    for (const s of (snaps ?? []) as Array<{
      id: string;
      metric_id: string;
      value: number;
      captured_on: string;
    }>) {
      if (!latest.has(s.metric_id)) latest.set(s.metric_id, s);
    }
    for (const d of (defs ?? []) as Array<{ id: string; name: string; unit: string | null }>) {
      const snap = latest.get(d.id);
      if (!snap) continue; // a metric with no snapshot has no value to ground in
      metrics.push({
        snapshot_id: snap.id,
        metric_id: d.id,
        name: d.name,
        value: Number(snap.value),
        unit: d.unit,
        captured_on: snap.captured_on,
      });
    }
  }

  // ── 5. Redact, then prove it worked. ─────────────────────────────────────
  const { redacted, grounding } = redactStoryForModel(
    {
      id: params.id,
      title: story.title as string,
      body: story.body as string | null,
      outcome: story.outcome as string | null,
    },
    subjects,
    metrics,
  );

  const prompt = buildComposerPrompt({
    channel,
    title: redacted.title,
    body: redacted.body,
    outcome: redacted.outcome,
    subjectDescriptions: redacted.subjectDescriptions,
    metrics: redacted.metrics,
    orgName: ctx.orgName ?? "the organization",
  });

  const leak = leaksAnyName(prompt, subjects);
  if (leak) {
    // Unreachable unless redactNames is broken by an edit. The point is that
    // the failure mode is a 500, not a child's name in a request body.
    console.error("[comms] REFUSED: a name survived redaction; no model call made");
    return NextResponse.json(
      { error: "We couldn't safely redact this story, so nothing was sent. Please report this." },
      { status: 500 },
    );
  }

  const spec = CHANNEL_SPECS[channel];
  let result;
  try {
    result = await generateText({
      system: COMPOSER_SYSTEM,
      prompt,
      tier: "fast",
      maxTokens: spec.maxTokens,
    });
  } catch (e) {
    if (e instanceof AIKeyMissingError) {
      return NextResponse.json({ error: "AI drafting isn't configured." }, { status: 500 });
    }
    console.error("[comms] compose failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The draft didn't come back. Try again." }, { status: 502 });
  }

  await logAICall(supabase, {
    orgId: ctx.orgId,
    surface: "comms_composer",
    model: result.model,
    tokensInput: result.usage.inputTokens,
    tokensOutput: result.usage.outputTokens,
    costUsd: result.costUsd,
    triggeredBy: (await getAdminUser()) ?? null,
    metadata: { channel, story_id: params.id, metrics: metrics.length },
  });

  const fullGrounding = {
    ...grounding,
    channel,
    model: result.model,
    tokens_input: result.usage.inputTokens,
    tokens_output: result.usage.outputTokens,
  };

  const { data: output, error } = await supabase
    .from("comms_outputs")
    .insert({
      org_id: ctx.orgId,
      story_id: params.id,
      channel,
      body: result.text,
      status: "draft",
      model_grounding: fullGrounding,
      created_by: (await getAdminUser()) ?? null,
    })
    .select("id, channel, body, status, model_grounding, created_at")
    .single();

  if (error || !output) {
    console.error("[comms] output insert failed:", error?.message);
    return NextResponse.json({ error: "The draft came back but couldn't be saved." }, { status: 500 });
  }

  await audit(req, {
    action: "comms.output.draft",
    entityType: "story",
    entityId: params.id,
    after: {
      output_id: output.id,
      channel,
      model: result.model,
      redactions: grounding.redactions.length,
      metrics: metrics.length,
    },
  });

  return NextResponse.json({
    ok: true,
    output,
    provenance: provenanceNote({
      metricCount: metrics.length,
      redactionCount: grounding.redactions.reduce((n, r) => n + r.count, 0),
      model: result.model,
    }),
  });
}
