import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireEntitlement, hasEntitlement } from "@/lib/admin/entitlements";
import { buildReedTools } from "@/lib/agents/reed/tools";
import { runReedAsk } from "@/lib/agents/reed/client";
import {
  REED_ASK_MODEL,
  estimateReedCostUsd,
  REED_MONTHLY_CAP_USD,
  REED_MONTHLY_WARN_USD,
} from "@/lib/agents/reed/cost";
import { logAICall, type AICallStatus } from "@/lib/ai/ledger";
import { cleanVoiceText } from "@/lib/ai/voice";
import { orgOverAICap } from "@/lib/ai/cap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_TURNS = 12;

/**
 * POST /api/reed/ask — the one Reed orchestrator. Every UI surface (the FAB, a
 * record-anchored opener, a reframed feature panel) calls this with a `surface`
 * and an optional `context_ref`.
 *
 * Sequence: entitlement (402) → cost cap (429) → assemble org context → Claude
 * with the read-only, permission-gated tool set on the SESSION client → log to
 * reed_activity_log → persist the turn to reed_threads / reed_messages. Reed
 * never uses the service-role client and never authors a number itself.
 */
export async function POST(req: NextRequest) {
  // 1. Entitlement — server-side, the real boundary (the FAB is just an affordance).
  const ent = await requireEntitlement("ai.reed");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  const { ctx } = ent;
  const supabase = createServerSupabase();

  const body = (await req.json().catch(() => null)) as {
    message?: unknown;
    surface?: unknown;
    context_ref?: unknown;
    thread_id?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_CHARS) : "";
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
  const surface = typeof body?.surface === "string" ? body.surface.slice(0, 40) : "fab";
  const contextRef =
    body?.context_ref && typeof body.context_ref === "object" ? (body.context_ref as Record<string, unknown>) : null;
  const incomingThreadId = typeof body?.thread_id === "string" ? body.thread_id : null;

  // 2. Cost cap — month-to-date for THIS org (explicit filter; multi-tenant safe).
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: mtdRows } = await supabase
    .from("reed_activity_log")
    .select("cost_usd")
    .eq("org_id", ctx.orgId)
    .gte("created_at", monthStart.toISOString());
  const mtdSpend = (mtdRows ?? []).reduce((s, r) => s + Number((r as { cost_usd: number | null }).cost_usd ?? 0), 0);
  if (mtdSpend >= REED_MONTHLY_CAP_USD) {
    return NextResponse.json(
      {
        error: `Reed has reached this month's usage cap ($${REED_MONTHLY_CAP_USD}). It resets next month.`,
        capped: true,
      },
      { status: 429 },
    );
  }
  const budgetWarning =
    mtdSpend >= REED_MONTHLY_WARN_USD ? `Heads up — Reed is at $${mtdSpend.toFixed(2)} of $${REED_MONTHLY_CAP_USD} this month.` : null;

  // 2b. Global org backstop across ALL AI surfaces (above the per-surface cap). Fail-open.
  const orgCap = await orgOverAICap(supabase, ctx.orgId);
  if (orgCap.over) {
    return NextResponse.json(
      { error: `This org has reached its monthly AI spend cap ($${orgCap.capUsd}). It resets next month.`, capped: true },
      { status: 429 },
    );
  }

  // 3. Assemble context: the org foundation (RLS-scoped) + the surface's anchor.
  const { data: foundation } = await supabase
    .from("plan_foundation")
    .select("mission, vision")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  // 4. Conversational memory: replay prior text turns of the thread, if any.
  let threadId = incomingThreadId;
  const priorMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (threadId) {
    const { data: existing } = await supabase
      .from("reed_messages")
      .select("role, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY_TURNS);
    for (const m of existing ?? []) {
      const role = (m as { role: string }).role;
      if (role === "user" || role === "assistant") priorMessages.push({ role, content: (m as { content: string }).content });
    }
  }

  // Bloom Flourish coaching seam: if the org has the `coaching` entitlement,
  // Reed may tee up a human SOBO session for the judgment-heavy 20%.
  const coaching = await hasEntitlement("coaching");
  const system = buildSystemPrompt({
    mission: (foundation?.mission as string | null) ?? null,
    vision: (foundation?.vision as string | null) ?? null,
    contextRef,
    coaching,
  });

  // 5–6. Run Claude with the read-only tool set on the session client.
  const startedAt = Date.now();
  const tools = buildReedTools(supabase, ctx.orgId, ctx.email);
  let run;
  try {
    run = await runReedAsk({
      system,
      messages: [...priorMessages, { role: "user", content: message }],
      tools,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Reed failed";
    await supabase.from("reed_activity_log").insert({
      org_id: ctx.orgId,
      created_by: "agent",
      triggered_by: ctx.email,
      action_type: "ask",
      surface,
      thread_id: threadId,
      context_ref: contextRef,
      prompt_summary: message.slice(0, 200),
      model_used: REED_ASK_MODEL,
      status: "failed",
      error_message: errMsg,
    });
    console.error("[reed/ask] run failed:", errMsg);
    return NextResponse.json({ error: "Reed hit an error — try again." }, { status: 502 });
  }

  const durationMs = Date.now() - startedAt;
  const costUsd = estimateReedCostUsd(run.tokensInput, run.tokensOutput);
  // Voice sweep at the boundary: Reed's reply goes to a human and is stored.
  const answer = cleanVoiceText(run.text);

  // 7–8. Persist: thread (create on first turn), then log row, then both messages.
  if (!threadId) {
    const { data: thread } = await supabase
      .from("reed_threads")
      .insert({
        org_id: ctx.orgId,
        created_by: ctx.email,
        surface,
        context_ref: contextRef,
        title: message.slice(0, 60),
      })
      .select("id")
      .single();
    threadId = (thread?.id as string | undefined) ?? null;
  }

  const { data: logRow } = await supabase
    .from("reed_activity_log")
    .insert({
      org_id: ctx.orgId,
      created_by: "agent",
      triggered_by: ctx.email,
      action_type: "ask",
      surface,
      thread_id: threadId,
      context_ref: contextRef,
      prompt_summary: message.slice(0, 200),
      model_used: run.model,
      tokens_input: run.tokensInput,
      tokens_output: run.tokensOutput,
      duration_ms: durationMs,
      cost_usd: Number(costUsd.toFixed(6)),
      status: run.status,
      metadata: { tool_calls: run.toolCalls },
    })
    .select("id")
    .single();

  // Mirror into the unified AI ledger. Additive: reed_activity_log above stays
  // the source for Reed's own cap; this feeds the per-org spend view. Never throws.
  await logAICall(supabase, {
    orgId: ctx.orgId,
    surface: "reed",
    model: run.model,
    tokensInput: run.tokensInput,
    tokensOutput: run.tokensOutput,
    costUsd,
    triggeredBy: ctx.email,
    status: run.status as AICallStatus,
    metadata: { thread_id: threadId },
  });

  if (threadId) {
    await supabase.from("reed_messages").insert([
      { thread_id: threadId, org_id: ctx.orgId, role: "user", content: message },
      {
        thread_id: threadId,
        org_id: ctx.orgId,
        role: "assistant",
        content: answer,
        activity_log_id: (logRow?.id as string | undefined) ?? null,
      },
    ]);
  }

  return NextResponse.json({ text: answer, thread_id: threadId, budgetWarning });
}

function buildSystemPrompt(opts: {
  mission: string | null;
  vision: string | null;
  contextRef: Record<string, unknown> | null;
  coaching?: boolean;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "You are Reed, the AI assistant inside BloomOS — the operating system a nonprofit runs on.",
    "You help the operator understand and act on their real data across fundraising, finance, program, and ops.",
    `Today is ${today}.`,
    "",
    "HARD RULES:",
    "- Never invent or compute a number yourself. Every figure you state must come from a tool result. If you need a number, call the tool.",
    "- Prefer the tools for anything quantitative; explain_metric tells you how a number is defined before you interpret it.",
    "- If a tool returns { error: \"permission_denied\" }, tell the user plainly that they don't have access to that data — do not guess around it.",
    "- You can read data and you can DRAFT (compose a grant narrative, board update, or donor acknowledgment and save it with save_draft for human review). A draft is inert: saving it never sends an email, submits a grant, or changes any live record. You draft; a human always reviews and sends.",
    "- Before drafting, ground the content in real data — call get_org_foundation_and_outcomes and the finance tools — and never invent a figure or an outcome.",
    "- You can PROPOSE a next best action in any module (propose_next_best_action) — an inert recommendation a human accepts or dismisses. Proposing never performs the action. Prefer one high-value, well-grounded action over a list.",
    "- For STRATEGY (the OGSM plan), always call get_strategy_coherence FIRST and lead with its structural findings — they're computed from the real rows, so state them as fact and cite the named objectives/goals/KPIs. THEN add your judgment (vanity vs. outcome KPIs, mission alignment, target realism vs. runway via the finance tools). When designing or filling gaps, use propose_plan_element to propose objectives/goals/initiatives/KPIs — INERT proposals the operator accepts or dismisses; proposing never writes the plan. Ladder each child to a real parent via parent_id (from get_strategy_plan), and never claim a KPI's current value you didn't read. You can save a review with save_draft kind 'strategy_review'. When building from scratch or facilitating an empty/thin plan, work ONE LEVEL AT A TIME — propose 2–3 objectives and stop for the operator to accept before you propose goals, then measures; never dump a whole tree at once. You are a sparring partner — sharpen the plan, don't replace the operator's judgment.",
    "- You cannot send, submit, move money, change permissions, or delete anything. Those stay human.",
    "- Be concise and direct. Lead with the answer. Cite the figures you used.",
  ];
  if (opts.coaching) {
    lines.push(
      "- This org is on Bloom Flourish (human coaching). For a judgment-heavy call that goes beyond what software should decide — a major strategic pivot, a board conflict, a hard prioritization — you may offer to tee it up with a SOBO coaching session. Offer it sparingly, only when a human coach genuinely adds value; never force it.",
    );
  }
  if (opts.contextRef?.type === "meeting_agenda") {
    lines.push(
      "",
      "MEETING PREP MODE — the operator is preparing for an upcoming meeting and wants a thoughtful agenda. Work in steps:",
      "1. Call get_meeting_brief with the event_id from the context to see who the meeting is with and whether each person is a first meeting or a follow-up (prior_touchpoints / is_first_meeting).",
      "2. For EACH matched donor call get_constituent_dossier, and for each partner call get_partner_dossier — review their giving, recent interactions, and open asks. Don't skip this: the agenda must be grounded in their REAL history, never invented.",
      "3. Produce a tailored agenda. FIRST meeting (no prior touchpoints): lead with a warm intro and discovery questions, grounded in whatever profile data exists. FOLLOW-UP: open by referencing the most recent interaction, pick up open threads and asks, and propose the natural next step.",
      "Structure it as: a one-line objective for the meeting; 3–5 talking points, each tied to something concrete from their history; the specific ask or next step to land; and 1–2 open questions. Cite the real facts you used (last gift, last meeting, open opportunity, MOU status). If a dossier returns permission_denied, or the meeting has no matched donor/partner, say so plainly and prep from what you do have.",
    );
  }
  if (opts.mission) lines.push("", `Organization mission: ${opts.mission}`);
  if (opts.vision) lines.push(`Organization vision: ${opts.vision}`);
  if (opts.contextRef) lines.push("", `The user opened you from this record: ${JSON.stringify(opts.contextRef)}.`);
  return lines.join("\n");
}
