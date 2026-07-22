/**
 * Reed next move for ONE constituent or bench prospect, persisted.
 *
 * POST { entity_type, entity_id } assembles the full dossier BloomOS already
 * holds on that person (giving + retention flags, conversations incl. the
 * HubSpot mirror, open asks/tasks, research brief), asks the next-move agent
 * for the single best action + a ready-to-send email draft, persists it to
 * reed_next_moves (superseding any still-open suggestion for the entity), and
 * returns it. GET ?entity_type&entity_id reloads the latest suggestion so
 * profile pages never re-run the agent just to render. PATCH-like decisions
 * (applied/dismissed) ride on this route via POST { decide }.
 *
 * Spend discipline mirrors the NBA route: per-user rate limit, the shared
 * fundraising agent wallet, the org-wide AI cap, and a row in the unified
 * ai_calls ledger per run.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { constituentName } from "@/lib/fundraising/display";
import { analyzeDonor, FLAG_LABELS, type RetentionFlag } from "@/lib/fundraising/retention";
import { scoreDonor } from "@/lib/fundraising/engagement";
import { todayISO } from "@/app/admin/ops/_types/ops";
import { runNextMove } from "@/lib/agents/next-move/agent";
import type { NextMoveDossier, NextMoveEntityType, NextMoveRecord } from "@/lib/agents/next-move/types";
import { logAICall } from "@/lib/ai/ledger";
import { orgOverAICap } from "@/lib/ai/cap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MONTHLY_BUDGET_HARD_USD = 20; // shared fundraising agent wallet (same as NBA/research)

type Supabase = ReturnType<typeof createServerSupabase>;

const ENTITY_TYPES: NextMoveEntityType[] = ["constituent", "fr_prospects"];
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function toRecord(row: {
  id: string;
  action: string;
  rationale: string | null;
  channel: string | null;
  due_in_days: number | null;
  email_subject: string | null;
  email_body: string | null;
  model_used: string | null;
  created_at: string;
}): NextMoveRecord {
  return {
    id: row.id,
    action: row.action,
    rationale: row.rationale ?? "",
    channel: (row.channel as NextMoveRecord["channel"]) ?? "other",
    dueInDays: row.due_in_days ?? 3,
    emailSubject: row.email_subject,
    emailBody: row.email_body,
    model: row.model_used ?? "",
    generatedAt: row.created_at,
  };
}

async function latestSuggestion(
  supabase: Supabase,
  entityType: string,
  entityId: string
): Promise<NextMoveRecord | null> {
  const { data } = await supabase
    .from("reed_next_moves")
    .select("id, action, rationale, channel, due_in_days, email_subject, email_body, model_used, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "suggested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRecord(data) : null;
}

// ── Dossier assembly ────────────────────────────────────────────────────────

const MAX_GIFTS = 25;
const MAX_INTERACTIONS = 20;
const BRIEF_EXCERPT_CHARS = 1800;

async function constituentDossier(supabase: Supabase, id: string, orgId: string): Promise<NextMoveDossier | null> {
  const [cRes, giftsRes, plansRes, interRes, acksRes, oppsRes] = await Promise.all([
    supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, emails, do_not_contact, tags, notes, external_ids")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("gifts")
      .select("amount, gift_date, method")
      .eq("constituent_id", id)
      .order("gift_date", { ascending: false })
      .limit(5000),
    supabase.from("recurring_plans").select("id").eq("constituent_id", id).eq("status", "active").limit(1),
    supabase
      .from("interactions")
      .select("kind, occurred_at, direction, subject, body_preview, notes, is_private")
      .eq("constituent_id", id)
      .order("occurred_at", { ascending: false })
      .limit(60),
    supabase
      .from("acknowledgments")
      .select("sent_at")
      .eq("subject_type", "constituent")
      .eq("subject_id", id)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1),
    supabase
      .from("opportunities")
      .select("stage, ask_amount, next_step, next_step_due")
      .eq("constituent_id", id)
      .in("stage", ["identify", "qualify", "cultivate", "solicit"])
      .limit(10),
  ]);
  if (!cRes.data) return null;
  const c = cRes.data;

  const gifts = ((giftsRes.data ?? []) as Array<{ amount: number; gift_date: string; method: string | null }>).map(
    (g) => ({ date: g.gift_date, amount: Number(g.amount), method: g.method })
  );
  const activeRecurring = (plansRes.data ?? []).length > 0;
  const dates = gifts.map((g) => g.date).sort();
  const today = todayISO();
  const { flags } = analyzeDonor(dates, today, activeRecurring);
  const lifetime = gifts.reduce((s, g) => s + g.amount, 0);
  const engagement = gifts.length > 0 ? scoreDonor(dates, lifetime, activeRecurring, today).score : null;

  // Interactions: skip private rows entirely; keep the most recent few with a
  // one-line summary each.
  const interactions = ((interRes.data ?? []) as Array<{
    kind: string;
    occurred_at: string;
    direction: string | null;
    subject: string | null;
    body_preview: string | null;
    notes: string | null;
    is_private: boolean | null;
  }>)
    .filter((i) => !i.is_private)
    .slice(0, MAX_INTERACTIONS)
    .map((i) => ({
      date: i.occurred_at.slice(0, 10),
      kind: i.kind,
      direction: i.direction,
      summary: [i.subject, i.body_preview ?? i.notes].filter(Boolean).join(" — ").slice(0, 240) || "(no details)",
    }));

  // Latest thank-you across gift acks + direct acks. Gift-level acks need the
  // gift ids, so approximate with the direct read plus the most recent gift ack.
  let lastThankedAt = ((acksRes.data ?? []) as Array<{ sent_at: string }>)[0]?.sent_at?.slice(0, 10) ?? null;
  {
    const { data: giftAck } = await supabase
      .from("acknowledgments")
      .select("sent_at, gift:gifts!inner ( constituent_id )")
      .eq("gifts.constituent_id", id)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1);
    const giftSent = ((giftAck ?? []) as Array<{ sent_at: string | null }>)[0]?.sent_at ?? null;
    if (giftSent && (!lastThankedAt || giftSent > lastThankedAt)) lastThankedAt = giftSent.slice(0, 10);
  }

  // Open linked tasks (ops_tasks has RLS disabled → service-role read, same as
  // the list pages).
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: taskRows } = await getSupabaseAdmin()
    .from("ops_tasks")
    .select("title, due_date")
    .eq("org_id", orgId)
    .eq("linked_entity_type", "constituent")
    .eq("linked_entity_id", id)
    .neq("status", "done")
    .limit(10);

  // Research brief, when the constituent is matched to HubSpot.
  let researchExcerpt: string | null = null;
  const hubspotId =
    typeof (c.external_ids as Record<string, unknown> | null)?.["hubspot"] === "string"
      ? ((c.external_ids as Record<string, unknown>)["hubspot"] as string)
      : null;
  if (hubspotId) {
    const { data: brief } = await supabase
      .from("fr_prospect_briefs")
      .select("content")
      .eq("hubspot_id", hubspotId)
      .maybeSingle();
    if (brief?.content) researchExcerpt = String(brief.content).slice(0, BRIEF_EXCERPT_CHARS);
  }

  return {
    entityType: "constituent",
    entityId: id,
    name: constituentName(c),
    kind: c.type,
    email: ((c.emails as string[]) ?? [])[0] ?? null,
    doNotContact: !!c.do_not_contact,
    tags: (c.tags as string[]) ?? [],
    notes: (c.notes as string | null) ?? null,
    lifetimeGiving: lifetime,
    giftCount: gifts.length,
    gifts: gifts.slice(0, MAX_GIFTS),
    activeRecurring,
    retentionFlags: flags.map((f: RetentionFlag) => FLAG_LABELS[f]),
    engagementScore: engagement,
    lastThankedAt,
    interactions,
    openAsks: ((oppsRes.data ?? []) as Array<{
      stage: string;
      ask_amount: number | null;
      next_step: string | null;
      next_step_due: string | null;
    }>).map((o) => ({
      stage: o.stage,
      askAmount: o.ask_amount !== null ? Number(o.ask_amount) : null,
      nextStep: o.next_step,
      nextStepDue: o.next_step_due,
    })),
    openTasks: ((taskRows ?? []) as Array<{ title: string; due_date: string | null }>).map((t) => ({
      title: t.title,
      dueDate: t.due_date,
    })),
    researchExcerpt,
    prospectContext: null,
  };
}

async function prospectDossier(supabase: Supabase, id: string): Promise<NextMoveDossier | null> {
  const { data: p } = await supabase
    .from("fr_prospects")
    .select("id, hubspot_contact_id, type, source, status, name, email, org_name, strategy_note")
    .eq("id", id)
    .maybeSingle();
  if (!p) return null;

  const hubspotId = p.hubspot_contact_id as string | null;
  const [briefRes, scoreRes, hsRes, commsRes] = await Promise.all([
    supabase
      .from("fr_prospect_briefs")
      .select("content")
      .eq("prospect_id", id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("fr_prospect_scores").select("score_total").eq("prospect_id", id).maybeSingle(),
    hubspotId
      ? supabase
          .from("hs_contacts")
          .select("lifecycle_stage, last_activity_at, company")
          .eq("hubspot_id", hubspotId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    hubspotId
      ? supabase
          .from("hs_engagements")
          .select("engagement_type, subject, body_preview, occurred_at")
          .contains("contact_ids", [hubspotId])
          .order("occurred_at", { ascending: false, nullsFirst: false })
          .limit(MAX_INTERACTIONS)
      : Promise.resolve({ data: [] }),
  ]);

  const hs = hsRes.data as { lifecycle_stage: string | null; last_activity_at: string | null; company: string | null } | null;
  const context: string[] = [];
  context.push(`Source: ${p.source}. Status: ${p.status}.`);
  if (p.org_name) context.push(`Organization: ${p.org_name}.`);
  if (p.strategy_note) context.push(`Why they're on the bench: ${p.strategy_note}`);
  const score = (scoreRes.data as { score_total: number | null } | null)?.score_total;
  if (score !== null && score !== undefined) context.push(`Internal prospect score: ${score}.`);
  if (hs?.lifecycle_stage) context.push(`HubSpot lifecycle: ${hs.lifecycle_stage}.`);
  if (hs?.last_activity_at) context.push(`Last HubSpot activity: ${hs.last_activity_at.slice(0, 10)}.`);

  return {
    entityType: "fr_prospects",
    entityId: id,
    name: (p.name as string) || (p.org_name as string) || "Unknown",
    kind: p.type as string,
    email: (p.email as string | null) ?? null,
    doNotContact: false,
    tags: [],
    notes: null,
    lifetimeGiving: 0,
    giftCount: 0,
    gifts: [],
    activeRecurring: false,
    retentionFlags: [],
    engagementScore: null,
    lastThankedAt: null,
    interactions: ((commsRes.data ?? []) as Array<{
      engagement_type: string | null;
      subject: string | null;
      body_preview: string | null;
      occurred_at: string | null;
    }>).map((e) => ({
      date: e.occurred_at?.slice(0, 10) ?? "unknown",
      kind: e.engagement_type ?? "note",
      direction: null,
      summary: [e.subject, e.body_preview].filter(Boolean).join(" — ").slice(0, 240) || "(no details)",
    })),
    openAsks: [],
    openTasks: [],
    researchExcerpt: (briefRes.data as { content: unknown } | null)?.content
      ? String((briefRes.data as { content: unknown }).content).slice(0, BRIEF_EXCERPT_CHARS)
      : null,
    prospectContext: context.join(" "),
  };
}

// ── Handlers ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entity_type") ?? "";
  const entityId = url.searchParams.get("entity_id") ?? "";
  if (!ENTITY_TYPES.includes(entityType as NextMoveEntityType) || !isUuid(entityId)) {
    return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
  }
  const supabase = createServerSupabase();
  return NextResponse.json({ suggestion: await latestSuggestion(supabase, entityType, entityId) });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const entityType = body?.entity_type as string;
  const entityId = body?.entity_id;
  if (!ENTITY_TYPES.includes(entityType as NextMoveEntityType) || !isUuid(entityId)) {
    return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const currentUser = await getAdminUser();
  if (!currentUser) return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });

  // Decision path (applied / dismissed) — no model call.
  const decide = body?.decide;
  if (decide === "applied" || decide === "dismissed") {
    const suggestionId = body?.suggestion_id;
    if (!isUuid(suggestionId)) return NextResponse.json({ error: "suggestion_id required" }, { status: 400 });
    await supabase
      .from("reed_next_moves")
      .update({ status: decide, decided_at: new Date().toISOString(), decided_by: currentUser })
      .eq("id", suggestionId)
      .eq("status", "suggested");
    return NextResponse.json({ ok: true });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
  }

  // Grow-tier gate on the model path only (401/402): deciding on an existing
  // suggestion above stays auth-only, so a downgraded org can still resolve
  // cards it already generated.
  const ent = await requireEntitlement("ai.reed");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  const ctx = ent.ctx;

  // Rate limit per user via the activity log.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount } = await supabase
    .from("fr_agent_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("triggered_by", currentUser)
    .filter("metadata->>kind", "eq", "next_move")
    .gte("created_at", windowStart);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: `Rate limit: ${RATE_LIMIT_MAX} next-move runs per 10 minutes. Try again shortly.` },
      { status: 429 }
    );
  }

  // Shared monthly fundraising-agent wallet.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: mtdRows } = await supabase
    .from("fr_agent_activity_log")
    .select("metadata")
    .gte("created_at", monthStart.toISOString());
  let mtdSpendUsd = 0;
  for (const r of (mtdRows ?? []) as Array<{ metadata: { estimated_cost_usd?: number } | null }>) {
    const c = Number(r.metadata?.estimated_cost_usd ?? 0);
    if (Number.isFinite(c)) mtdSpendUsd += c;
  }
  if (mtdSpendUsd >= MONTHLY_BUDGET_HARD_USD) {
    return NextResponse.json(
      { error: `Monthly agent budget exceeded ($${MONTHLY_BUDGET_HARD_USD}). Resets next month.` },
      { status: 402 }
    );
  }

  // Org-wide AI cap (backstop above the wallet). Fail-open.
  const orgCap = await orgOverAICap(supabase, ctx.orgId);
  if (orgCap.over) {
    return NextResponse.json(
      { error: `This org has reached its monthly AI spend cap ($${orgCap.capUsd}).` },
      { status: 402 }
    );
  }

  const dossier =
    entityType === "constituent"
      ? await constituentDossier(supabase, entityId, ctx.orgId)
      : await prospectDossier(supabase, entityId);
  if (!dossier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let result;
  try {
    result = await runNextMove(dossier, todayISO());
  } catch (e) {
    console.error("next-move agent error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Suggestion generation failed" }, { status: 502 });
  }

  // Spend accounting: agent wallet + unified ledger, success or not.
  await supabase.from("fr_agent_activity_log").insert({
    org_id: ctx.orgId,
    created_by: "agent",
    triggered_by: currentUser,
    action_type: "other",
    prompt_summary: `Next move for ${dossier.name}`,
    model_used: result.model,
    tokens_input: result.tokensInput,
    tokens_output: result.tokensOutput,
    status: result.suggestion ? "success" : "partial",
    metadata: { kind: "next_move", estimated_cost_usd: Number(result.costUsd.toFixed(4)), entity_type: entityType, entity_id: entityId },
  });
  await logAICall(supabase, {
    orgId: ctx.orgId,
    surface: "next_move",
    model: result.model,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    costUsd: result.costUsd,
    triggeredBy: currentUser,
    status: result.suggestion ? "success" : "partial",
    metadata: { entity_type: entityType },
  });

  if (!result.suggestion) {
    return NextResponse.json({ error: "The agent could not produce a suggestion. Try again." }, { status: 502 });
  }

  // Persist: supersede the prior open suggestion for this entity, insert fresh.
  await supabase
    .from("reed_next_moves")
    .update({ status: "superseded" })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "suggested");

  const s = result.suggestion;
  const { data: inserted, error: insErr } = await supabase
    .from("reed_next_moves")
    .insert({
      org_id: ctx.orgId,
      entity_type: entityType,
      entity_id: entityId,
      action: s.action,
      rationale: s.rationale,
      channel: s.channel,
      due_in_days: s.dueInDays,
      email_subject: s.emailSubject,
      email_body: s.emailBody,
      model_used: result.model,
      cost_usd: Number(result.costUsd.toFixed(6)),
      generated_by: currentUser,
      status: "suggested",
    })
    .select("id, action, rationale, channel, due_in_days, email_subject, email_body, model_used, created_at")
    .single();
  if (insErr || !inserted) {
    console.error("next-move persist error:", insErr?.message);
    return NextResponse.json({ error: "Could not save the suggestion" }, { status: 500 });
  }

  return NextResponse.json({ suggestion: toRecord(inserted), costUsd: Number(result.costUsd.toFixed(4)) });
}
