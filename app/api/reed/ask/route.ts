import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { buildReedTools } from "@/lib/agents/reed/tools";
import { runReedAsk } from "@/lib/agents/reed/client";
import {
  REED_ASK_MODEL,
  estimateReedCostUsd,
  REED_MONTHLY_CAP_USD,
  REED_MONTHLY_WARN_USD,
} from "@/lib/agents/reed/cost";

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

  const system = buildSystemPrompt({
    mission: (foundation?.mission as string | null) ?? null,
    vision: (foundation?.vision as string | null) ?? null,
    contextRef,
  });

  // 5–6. Run Claude with the read-only tool set on the session client.
  const startedAt = Date.now();
  const tools = buildReedTools(supabase, ctx.orgId);
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

  if (threadId) {
    await supabase.from("reed_messages").insert([
      { thread_id: threadId, org_id: ctx.orgId, role: "user", content: message },
      {
        thread_id: threadId,
        org_id: ctx.orgId,
        role: "assistant",
        content: run.text,
        activity_log_id: (logRow?.id as string | undefined) ?? null,
      },
    ]);
  }

  return NextResponse.json({ text: run.text, thread_id: threadId, budgetWarning });
}

function buildSystemPrompt(opts: {
  mission: string | null;
  vision: string | null;
  contextRef: Record<string, unknown> | null;
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
    "- You are read-only right now. You can explain, summarize, and recommend, but you cannot send, write, or change anything.",
    "- Be concise and direct. Lead with the answer. Cite the figures you used.",
  ];
  if (opts.mission) lines.push("", `Organization mission: ${opts.mission}`);
  if (opts.vision) lines.push(`Organization vision: ${opts.vision}`);
  if (opts.contextRef) lines.push("", `The user opened you from this record: ${JSON.stringify(opts.contextRef)}.`);
  return lines.join("\n");
}
