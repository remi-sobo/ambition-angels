/**
 * POST /api/admin/grants/coach/defend — one turn of the Grant Coach's
 * interactive "defend the draft" interrogation. Stateless: the client sends
 * the visible chat history back each turn; the server rebuilds the full
 * conversation (opening user turn = defend instructions + draft, then the
 * history) and returns the reviewer's next reply. Same guards as the one-shot
 * route: auth, org AI cap, spend ledger (surface: grant_coach).
 *
 * An empty history starts the session — the reviewer opens with three
 * rejection reasons and question 1 of 5.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { generateText, AIKeyMissingError } from "@/lib/ai/gateway";
import { logAICall } from "@/lib/ai/ledger";
import { orgOverAICap } from "@/lib/ai/cap";
import {
  DEFEND_DRAFT,
  getCoachLens,
  DEFAULT_LENS_ID,
  COACH_SYSTEM,
  MAX_FUNDER_CHARS,
} from "@/lib/fundraising/grantCoach";
import { resolveDraftFromBody, buildCoachOpeningMessage } from "@/lib/fundraising/grantCoachDocs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 5 questions + pushback re-asks fit comfortably; the cap is a runaway guard.
const MAX_TURNS = 30;
const MAX_TURN_CHARS = 4000;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

type Turn = { role: "user" | "assistant"; content: string };

function parseHistory(v: unknown): Turn[] | null {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > MAX_TURNS) return null;
  const out: Turn[] = [];
  for (const t of v) {
    const role = (t as Record<string, unknown>)?.role;
    const content = str((t as Record<string, unknown>)?.content, MAX_TURN_CHARS);
    if ((role !== "user" && role !== "assistant") || !content) return null;
    out.push({ role, content });
  }
  // The opening turn is server-built, so a valid history starts with the
  // reviewer's reply and ends with the applicant's latest answer (or is empty).
  if (out.length > 0 && (out[0].role !== "assistant" || out[out.length - 1].role !== "user")) {
    return null;
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  const history = parseHistory(body?.history);
  if (!history) {
    return NextResponse.json({ error: "Invalid chat history" }, { status: 400 });
  }
  // Missing lens defaults; a present-but-unknown value is a client bug — 400.
  const lens = getCoachLens(str(body?.lens, 40) ?? DEFAULT_LENS_ID);
  if (!lens) {
    return NextResponse.json({ error: "Unknown audience lens" }, { status: 400 });
  }
  const funderMaterials = str(body?.funderMaterials, MAX_FUNDER_CHARS);
  const grantId = str(body?.grantId, 36);

  const supabase = createServerSupabase();
  const draft = await resolveDraftFromBody(supabase, body);
  if (!draft.ok) {
    return NextResponse.json({ error: draft.error }, { status: draft.status });
  }

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
      messages: [
        buildCoachOpeningMessage({
          instructions: DEFEND_DRAFT.instructions,
          lens,
          source: draft.source,
          funderMaterials,
        }),
        ...history,
      ],
      tier: "deep",
      maxTokens: 1200,
      voice: false,
    });
  } catch (e) {
    if (e instanceof AIKeyMissingError) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
    }
    console.error("[grants/coach/defend] generation failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The reviewer stalled — try again." }, { status: 502 });
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
      metadata: {
        promptId: DEFEND_DRAFT.id,
        grantId,
        lens: lens.id,
        hadFunderMaterials: !!funderMaterials,
        draftSource: draft.source.type,
        turn: history.length,
      },
    });
  }

  return NextResponse.json({ text: result.text });
}
