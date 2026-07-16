/**
 * POST /api/admin/strategy/angles/draft — Reed drafts a full framing angle from
 * a short brief. Returns the structured angle for the wizard to review and
 * edit; it is NOT persisted here (the operator creates it via POST /angles
 * after editing). Text-in / JSON-out through the shared AI gateway, logged to
 * the unified spend ledger.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { generateText, AIKeyMissingError } from "@/lib/ai/gateway";
import { logAICall } from "@/lib/ai/ledger";
import { ANGLE_BADGES, ANGLE_TONES, angleStr } from "@/lib/admin/strategy/angle-fields";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Tenant identity is hardcoded here until agent prompts are parameterized by
// org (name + mission from orgs.settings — core fence spec §6d, later PR).
const SYSTEM = [
  "You are Reed, Ambition Angels' in-house strategist. Ambition Angels gives low-income teens",
  "career exposure, a trusted-adult layer, and coaching so they can picture and reach an",
  "economically empowered future. You help draft \"framing angles\" for the internal Strategy Room:",
  "one true mission, framed for whoever is across the table (a funder, a corporate CSR team, a",
  "place-based collaborative).",
  "",
  "Given a brief, write ONE angle. Return ONLY a JSON object (no markdown, no prose) with these keys:",
  "  name         — short title for the angle (a few words)",
  "  nav_title    — even shorter label for the jump nav",
  `  status_badge — one of: ${ANGLE_BADGES.join(", ")}`,
  `  tone         — one of: ${ANGLE_TONES.join(", ")}`,
  "  hook         — the one-liner you say out loud to open the room",
  "  frame        — 2-4 sentences in our voice making the case",
  "  lead         — a single quotable line that captures it",
  "  funds_label  — usually \"Who funds this\" (or \"Who buys this\" for a corporate buyer)",
  "  funds        — the named funders/buyers who back this angle",
  "  want         — the metrics/evidence those funders want to see",
  "  ask          — the ask: range, structure, and what to request",
  "  catch_label  — optional; a short label like \"The catch\" if there's a caveat, else null",
  "  catch_body   — optional; the caveat itself, else null",
  "  flag         — optional; a one-line caution (e.g. a number to pressure-test), else null",
  "",
  "Be concrete and grounded — name real funders and real metrics where you can. Match the",
  "confident, plain voice of the existing deck. Output the JSON object and nothing else.",
].join("\n");

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const brief = angleStr(body?.brief, 2000);
  if (!brief) return NextResponse.json({ error: "A brief is required" }, { status: 400 });

  const prompt = `Brief for the angle to draft:\n\n${brief}\n\nReturn the JSON object now.`;

  let result;
  try {
    result = await generateText({ system: SYSTEM, prompt, tier: "fast", maxTokens: 1400, voice: false });
  } catch (e) {
    if (e instanceof AIKeyMissingError) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
    }
    console.error("[strategy/angles/draft] generation failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Draft generation failed" }, { status: 502 });
  }

  // Log spend (best-effort; never blocks the response).
  const ctx = await getOrgContext();
  if (ctx?.orgId) {
    await logAICall(createServerSupabase(), {
      orgId: ctx.orgId,
      surface: "strategy_angle_draft",
      model: result.model,
      tokensInput: result.usage.inputTokens,
      tokensOutput: result.usage.outputTokens,
      costUsd: result.costUsd,
      triggeredBy: (await getAdminUser()) ?? null,
      status: "success",
    });
  }

  const parsed = extractJson(result.text);
  if (!parsed) {
    return NextResponse.json({ error: "Reed's draft wasn't valid — try rephrasing the brief." }, { status: 502 });
  }

  // Normalize into the angle field shape; drop anything off the allowed lists.
  const badge = angleStr(parsed.status_badge);
  const tone = angleStr(parsed.tone);
  const angle = {
    name: angleStr(parsed.name, 300) ?? "",
    nav_title: angleStr(parsed.nav_title),
    status_badge: badge && ANGLE_BADGES.includes(badge as (typeof ANGLE_BADGES)[number]) ? badge : null,
    tone: tone && ANGLE_TONES.includes(tone as (typeof ANGLE_TONES)[number]) ? tone : "neutral",
    hook: angleStr(parsed.hook),
    frame: angleStr(parsed.frame, 4000),
    lead: angleStr(parsed.lead),
    funds_label: angleStr(parsed.funds_label) ?? "Who funds this",
    funds: angleStr(parsed.funds, 4000),
    want: angleStr(parsed.want, 4000),
    catch_label: angleStr(parsed.catch_label),
    catch_body: angleStr(parsed.catch_body, 4000),
    ask: angleStr(parsed.ask),
    flag: angleStr(parsed.flag),
  };

  return NextResponse.json({ angle });
}
