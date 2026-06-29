import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin/auth";

/**
 * Conversational debugging intake (the upgraded "Report a bug" flow).
 *
 * The in-app reporter (ReportModal, bug mode) sends the running transcript here
 * each turn. Claude either asks ONE more focused follow-up question, or — once it
 * has enough to be useful — finalizes with a ready-to-paste Claude Code
 * debugging prompt plus a short task title. The point is to take the friction
 * out: Shannon/Remi describe what's off (by voice or text), the model interviews
 * them, and out comes a precise prompt Remi can drop straight into Claude Code,
 * instead of hand-crafting it through a back-and-forth himself.
 *
 * JSON in / JSON out (no photo here — the screenshot rides the final multipart
 * submit to /api/admin/report). Stateless: the client owns the transcript.
 */
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
// Hard ceiling on questions so the interview can't run forever; once the model
// has asked this many, we force it to finalize on the next turn.
const MAX_QUESTIONS = 4;

type Turn = { role: "user" | "assistant"; content: string };

type PageContext = { path?: string; title?: string } | null;

function buildSystem(opts: {
  pageContext: PageContext;
  hasPhoto: boolean;
  questionsAsked: number;
}): string {
  const ctxLines: string[] = [];
  if (opts.pageContext?.path) {
    ctxLines.push(
      `The reporter opened this from the BloomOS page: ${opts.pageContext.path}${
        opts.pageContext.title ? ` ("${opts.pageContext.title}")` : ""
      }. Treat that as the likely location of the issue unless they say otherwise.`,
    );
  }
  if (opts.hasPhoto) {
    ctxLines.push("The reporter attached a screenshot of the problem.");
  }
  const atCap = opts.questionsAsked >= MAX_QUESTIONS;
  const capLine = atCap
    ? `\n\nYou have already asked ${opts.questionsAsked} questions. Do NOT ask anything else. Respond with the "ready" object now, using everything gathered so far.`
    : "";

  return `You are the debugging intake assistant inside BloomOS, the internal admin dashboard for Ambition Angels (a Next.js 14 / TypeScript / Tailwind / Supabase web app). Two non-engineer operators use you: Remi (the founder) and Shannon (head of admin). When one of them notices something wrong, broken, or confusing in BloomOS, you briefly interview them and then write a precise debugging prompt that Remi can paste straight into Claude Code (an AI coding agent with full access to this codebase) to fix it.

How you work:
- Ask ONE short, concrete follow-up question at a time. Plain language, no engineering jargon. They are describing what they SEE on screen, not code.
- Across the whole interview, pin down: (1) exactly what's wrong right now (the current behavior), (2) what they expected or want instead (the desired behavior), (3) where in BloomOS it happens (which page, section, or button), (4) how to reproduce it or when it shows up, and (5) how bad or how frequent it is.
- Never re-ask something they already told you. If their first message already covers most of it, ask only what is genuinely missing.
- Keep it to at most ${MAX_QUESTIONS} questions total, and fewer whenever you can. The moment you have enough to write a specific, useful debugging prompt, stop asking and finalize.
- Be warm and quick. One sentence per question.
${ctxLines.length ? `\nContext for this report:\n- ${ctxLines.join("\n- ")}` : ""}

ALWAYS reply with a single JSON object and nothing else:
- To ask the next question: {"action":"ask","message":"<your one short question>"}
- When you have enough: {"action":"ready","title":"<task title, max 70 chars, summarizing the bug>","prompt":"<the full Claude Code debugging prompt>"}

The "prompt" (only in the ready object) must be a complete, self-contained brief for Claude Code working in this repository, written in second person to the coding agent, using these labeled sections:
- A one-line summary of the bug.
- "Observed behavior:" what currently happens, in the reporter's words made precise.
- "Expected behavior:" what should happen instead.
- "Where:" the page / section in BloomOS, as specifically as known.
- "Steps to reproduce:" numbered, if known.${
    opts.hasPhoto ? `\n- "Screenshot:" note that a screenshot is attached for reference.` : ""
  }
- "Acceptance criteria:" a short checklist describing what "fixed" looks like.
- End with exactly: "Investigate the root cause before changing code. Search the codebase to locate the relevant component or route, confirm the cause, then make the smallest correct fix and verify it."

Do not invent file names, components, or technical details the reporter did not give you — describe the symptom and let Claude Code locate the code. Never use em dashes anywhere.${capLine}`;
}

type Parsed =
  | { action: "ask"; message: string }
  | { action: "ready"; title: string; prompt: string };

function parseModel(text: string): Parsed | null {
  const raw = ("{" + text).replace(/^```json\s*/i, "").replace(/```\s*$/g, "").trim();
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (obj.action === "ready" && typeof obj.prompt === "string") {
    return {
      action: "ready",
      title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Bug report",
      prompt: obj.prompt.trim(),
    };
  }
  if (obj.action === "ask" && typeof obj.message === "string" && obj.message.trim()) {
    return { action: "ask", message: obj.message.trim() };
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    turns?: Turn[];
    pageContext?: PageContext;
    hasPhoto?: boolean;
  } | null;

  const turns = Array.isArray(body?.turns) ? body!.turns! : [];
  if (
    turns.length === 0 ||
    !turns.every((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
  ) {
    return NextResponse.json({ error: "Expected a non-empty transcript." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing its AI key." }, { status: 500 });
  }

  const questionsAsked = turns.filter((t) => t.role === "assistant").length;
  const system = buildSystem({
    pageContext: body?.pageContext ?? null,
    hasPhoto: Boolean(body?.hasPhoto),
    questionsAsked,
  });

  const messages = [
    ...turns.map((t) => ({ role: t.role, content: t.content })),
    // Prefill the opening brace so the model must continue valid JSON.
    { role: "assistant" as const, content: "{" },
  ];

  let parsed: Parsed | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      console.error("[report/debug] Anthropic error:", await res.text());
      return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
    }
    const data = await res.json();
    parsed = parseModel(data?.content?.[0]?.text ?? "");
  } catch (e) {
    console.error("[report/debug] request failed:", e);
    return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }

  if (!parsed) {
    return NextResponse.json({ error: "Couldn't read the assistant's reply. Try again." }, { status: 502 });
  }

  return NextResponse.json(parsed);
}
