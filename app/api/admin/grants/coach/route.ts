/**
 * POST /api/admin/grants/coach — run one Grant Coach prompt (assessment or a
 * deep dive) over a pasted proposal draft, optionally with pasted funder
 * materials. Text-in / text-out through the shared AI gateway on the deep
 * tier (this is judgment work), logged to the unified spend ledger and
 * guarded by the org-wide monthly cap. Nothing is persisted — the result
 * renders in the panel and the operator acts on it in the draft.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { generateText, AIKeyMissingError } from "@/lib/ai/gateway";
import { logAICall } from "@/lib/ai/ledger";
import { orgOverAICap } from "@/lib/ai/cap";
import {
  getCoachPrompt,
  buildCoachUserPrompt,
  COACH_SYSTEM,
  MAX_PROPOSAL_CHARS,
  MAX_FUNDER_CHARS,
} from "@/lib/fundraising/grantCoach";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const promptId = str(body?.promptId, 60);
  const coachPrompt = promptId ? getCoachPrompt(promptId) : null;
  if (!coachPrompt) {
    return NextResponse.json({ error: "Unknown coach prompt" }, { status: 400 });
  }
  const proposal = str(body?.proposal, MAX_PROPOSAL_CHARS);
  if (!proposal || proposal.length < 200) {
    return NextResponse.json(
      { error: "Paste the full proposal draft first (at least a few paragraphs)." },
      { status: 400 }
    );
  }
  const funderMaterials = str(body?.funderMaterials, MAX_FUNDER_CHARS);
  // Optional, for the spend ledger only — the run itself is stateless.
  const grantId = str(body?.grantId, 36);

  const supabase = createServerSupabase();
  const ctx = await getOrgContext();
  if (ctx?.orgId) {
    const cap = await orgOverAICap(supabase, ctx.orgId);
    if (cap.over) {
      return NextResponse.json(
        { error: `This month's AI budget is used up ($${cap.spentUsd.toFixed(0)} of $${cap.capUsd}).` },
        { status: 429 }
      );
    }
  }

  let result;
  try {
    result = await generateText({
      system: COACH_SYSTEM,
      prompt: buildCoachUserPrompt({ instructions: coachPrompt.instructions, proposal, funderMaterials }),
      tier: "deep",
      maxTokens: 3500,
      // The coach's output formats are load-bearing (bold labels, exact lines);
      // keep them untouched.
      voice: false,
    });
  } catch (e) {
    if (e instanceof AIKeyMissingError) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
    }
    console.error("[grants/coach] generation failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The coach run failed — try again." }, { status: 502 });
  }

  if (ctx?.orgId) {
    await logAICall(supabase, {
      orgId: ctx.orgId,
      surface: "grant_coach",
      model: result.model,
      tokensInput: result.usage.inputTokens,
      tokensOutput: result.usage.outputTokens,
      costUsd: result.costUsd,
      triggeredBy: (await getAdminUser()) ?? null,
      status: "success",
      metadata: { promptId: coachPrompt.id, grantId, hadFunderMaterials: !!funderMaterials },
    });
  }

  return NextResponse.json({ text: result.text, promptId: coachPrompt.id, label: coachPrompt.label });
}
