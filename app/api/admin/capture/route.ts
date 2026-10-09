import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { getAdminUser } from "@/lib/admin/auth";
import { AIKeyMissingError, generateStructured } from "@/lib/ai/gateway";
import { orgOverAICap } from "@/lib/ai/cap";
import { logAICall } from "@/lib/ai/ledger";
import {
  CAPTURE_DEFAULT_TZ,
  CAPTURE_MAX_OUTPUT_TOKENS,
  CAPTURE_RATE_LIMIT_PER_HOUR,
  CAPTURE_SURFACE,
  MAX_TRANSCRIPT_CHARS,
  MIN_TRANSCRIPT_CHARS,
} from "@/lib/capture/constants";
import { CONTEXT_TYPES, resolveContext, type ContextType } from "@/lib/capture/context";
import { findCandidates } from "@/lib/capture/match";
import { CAPTURE_TOOL, buildCapturePrompt, buildCaptureSystem } from "@/lib/capture/prompt";
import { extractNameSpans } from "@/lib/capture/spans";
import { loadStaff } from "@/lib/capture/staff";
import { parseCaptureCards } from "@/lib/capture/validate";
import type { ContextEntity } from "@/lib/capture/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/capture (specs/bloomos-capture.md, C2 step 7).
 *
 * A transcript in, a `captures` row in status `ready` with `capture_cards`
 * rows (proposed or held) out. Nothing else in the database changes except
 * one ai_calls row. No destination table is touched here; confirming a card
 * is C3's job.
 *
 * Order: entitlement (401/402) -> session client -> per-user rate limit (429)
 * -> org AI cap (429) -> transcript bounds (400) -> captures row (parsing)
 * -> staff + context + spans + candidates -> one structured model call ->
 * validate -> cards -> ledger -> captures row (ready). Any model or
 * validation failure leaves the captures row in `failed` with parse_error
 * and returns 502 with the capture_id so the UI can retry or type instead.
 *
 * Session client only. The service-role client is never imported here or
 * anywhere under lib/capture (tests/capture-fence.test.ts pins it).
 */

const SURFACES = ["mobile_plus", "quick_add", "entity_page", "paste"] as const;
type Surface = (typeof SURFACES)[number];

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

type Body = {
  transcript?: unknown;
  source_surface?: unknown;
  context_type?: unknown;
  context_id?: unknown;
  duration_seconds?: unknown;
  capture_id?: unknown;
};

export async function POST(req: NextRequest) {
  const ent = await requireEntitlement("ai.capture");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  const { ctx } = ent;
  const supabase = createServerSupabase();

  // Per-user rate limit: the caller's own captures in the last hour (ruling 6).
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await supabase
    .from("captures")
    .select("id", { count: "exact", head: true })
    .eq("created_by", ctx.userId)
    .gte("created_at", since);
  if ((recent ?? 0) >= CAPTURE_RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: `Capture is limited to ${CAPTURE_RATE_LIMIT_PER_HOUR} recordings an hour. Try again in a bit.`, rate_limited: true },
      { status: 429 },
    );
  }

  // Org-wide AI backstop across all surfaces. 429 keeps 402 as the entitlement signal.
  const cap = await orgOverAICap(supabase, ctx.orgId);
  if (cap.over) {
    return NextResponse.json(
      { error: `This org has reached its monthly AI spend cap ($${cap.capUsd}). It resets next month.`, capped: true },
      { status: 429 },
    );
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (transcript.length < MIN_TRANSCRIPT_CHARS || transcript.length > MAX_TRANSCRIPT_CHARS) {
    return NextResponse.json(
      { error: `transcript must be ${MIN_TRANSCRIPT_CHARS} to ${MAX_TRANSCRIPT_CHARS} characters` },
      { status: 400 },
    );
  }
  const surface: Surface = SURFACES.includes(body.source_surface as Surface) ? (body.source_surface as Surface) : "paste";
  const contextType = CONTEXT_TYPES.includes(body.context_type as ContextType) ? (body.context_type as ContextType) : null;
  const contextId = contextType && isUuid(body.context_id) ? body.context_id : null;
  const duration =
    typeof body.duration_seconds === "number" && Number.isFinite(body.duration_seconds)
      ? Math.max(0, Math.round(body.duration_seconds))
      : null;

  // The captures row. A capture_id re-parses an existing capture the caller
  // owns (a failed one, or a retry); otherwise a new row is inserted. org_id
  // comes from the session context, never a default.
  let captureId: string;
  if (isUuid(body.capture_id)) {
    const { data: existing } = await supabase
      .from("captures")
      .select("id, status")
      .eq("id", body.capture_id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    captureId = (existing as { id: string }).id;
    const { error: resetErr } = await supabase
      .from("captures")
      .update({
        transcript,
        duration_seconds: duration,
        status: "parsing",
        parse_error: null,
        source_surface: surface,
        context_type: contextType,
        context_id: contextId,
      })
      .eq("id", captureId);
    if (resetErr) return NextResponse.json({ error: "Could not reset capture" }, { status: 500 });
    // Only undecided cards are replaced; a confirmed card is a real row elsewhere.
    await supabase.from("capture_cards").delete().eq("capture_id", captureId).in("status", ["proposed", "held"]);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("captures")
      .insert({
        org_id: ctx.orgId,
        created_by: ctx.userId,
        source_surface: surface,
        context_type: contextType,
        context_id: contextId,
        transcript,
        duration_seconds: duration,
        status: "parsing",
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error("[capture] insert failed:", insErr?.message);
      return NextResponse.json({ error: "Could not start capture" }, { status: 500 });
    }
    captureId = (inserted as { id: string }).id;
  }

  const fail = async (message: string, status: number) => {
    await supabase
      .from("captures")
      .update({ status: "failed", parse_error: message.slice(0, 500) })
      .eq("id", captureId);
    return NextResponse.json({ error: message, capture_id: captureId }, { status });
  };

  try {
    const tz = CAPTURE_DEFAULT_TZ;
    const todayIso = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");

    const [staff, context, handle] = await Promise.all([
      loadStaff(supabase, ctx.orgId),
      contextType && contextId ? resolveContext(supabase, contextType, contextId) : Promise.resolve<ContextEntity | null>(null),
      getAdminUser(),
    ]);
    const userName = staff.find((s) => s.userId === ctx.userId)?.name ?? handle ?? ctx.email;

    const spans = extractNameSpans(transcript);
    const { candidates } = await findCandidates(supabase, ctx.orgId, spans, context);

    const result = await generateStructured({
      system: buildCaptureSystem(),
      prompt: buildCapturePrompt({ transcript, todayIso, tz, userName, staff, context, candidates }),
      tier: "fast",
      maxTokens: CAPTURE_MAX_OUTPUT_TOKENS,
      tool: CAPTURE_TOOL,
    });

    const parsed = parseCaptureCards(result.input, { candidates, staff, todayIso });

    if (parsed.cards.length > 0) {
      const { error: cardsErr } = await supabase.from("capture_cards").insert(
        parsed.cards.map((c) => ({
          org_id: ctx.orgId,
          capture_id: captureId,
          created_by: ctx.userId,
          position: c.position,
          dest: c.dest,
          status: c.status,
          entity_type: c.entity_type,
          entity_id: c.entity_id,
          heard_name: c.heard_name,
          match_confidence: c.match_confidence,
          match_candidates: c.match_candidates,
          payload: c.payload,
        })),
      );
      if (cardsErr) return fail(`Could not save cards: ${cardsErr.message}`, 502);
    }

    const aiCallId = await logAICall(supabase, {
      orgId: ctx.orgId,
      surface: CAPTURE_SURFACE,
      model: result.model,
      tokensInput: result.usage.inputTokens,
      tokensOutput: result.usage.outputTokens,
      costUsd: result.costUsd,
      triggeredBy: handle ?? ctx.email,
      status: result.input ? "success" : "partial",
      metadata: {
        capture_id: captureId,
        card_count: parsed.cards.length,
        youth_skipped: parsed.youthSkipped,
        dropped: parsed.dropped,
        spans: spans.length,
        candidates: candidates.length,
      },
    });

    await supabase
      .from("captures")
      .update({ status: "ready", model_used: result.model, ai_call_id: aiCallId, parse_error: null })
      .eq("id", captureId);

    return NextResponse.json({
      capture_id: captureId,
      status: "ready",
      cards: parsed.cards,
      youth_skipped: parsed.youthSkipped,
      dropped: parsed.dropped,
    });
  } catch (e) {
    if (e instanceof AIKeyMissingError) return fail("ANTHROPIC_API_KEY is not configured", 503);
    const msg = e instanceof Error ? e.message : "Capture parsing failed";
    console.error("[capture] parse failed:", msg);
    return fail("Capture parsing failed", 502);
  }
}
