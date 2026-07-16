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
type ReportType = "bug" | "confusing" | "idea";

function buildSystem(opts: {
  type: ReportType;
  pageContext: PageContext;
  hasPhoto: boolean;
  questionsAsked: number;
}): string {
  const ctxLines: string[] = [];
  if (opts.pageContext?.path) {
    ctxLines.push(
      `The reporter opened this from the BloomOS page: ${opts.pageContext.path}${
        opts.pageContext.title ? ` ("${opts.pageContext.title}")` : ""
      }. Treat that as the likely location unless they say otherwise.`,
    );
  }
  if (opts.hasPhoto) {
    ctxLines.push("The reporter attached a screenshot.");
  }
  const atCap = opts.questionsAsked >= MAX_QUESTIONS;
  const capLine = atCap
    ? `\n\nYou have already asked ${opts.questionsAsked} questions. Do NOT ask anything else. Respond with the "ready" object now, using everything gathered so far.`
    : "";

  const isIdea = opts.type === "idea";
  const kind = isIdea
    ? "an idea or improvement they want in BloomOS"
    : opts.type === "confusing"
    ? "something in BloomOS that is confusing or not behaving the way they expect"
    : "something in BloomOS that is broken or wrong";

  // Idea → a feature/implementation brief; bug/confusing → a debugging/fix brief.
  const goals = isIdea
    ? `(1) what they want to be able to do (the goal), (2) how it should work / what it should look like, (3) where in BloomOS it belongs (which page or section), (4) why it matters or what it unblocks, and (5) any must-haves or edge cases.`
    : `(1) exactly what's wrong or confusing right now (the current behavior), (2) what they expected or want instead (the desired behavior), (3) where in BloomOS it happens (which page, section, or button), (4) how to reproduce it or when it shows up, and (5) how bad or how frequent it is.`;

  const promptSpec = isIdea
    ? `The "prompt" (only in the ready object) must be a complete, self-contained brief for Claude Code working in this repository, written in second person to the coding agent, using these labeled sections:
- A one-line summary of the feature/improvement.
- "Goal:" what the reporter wants to be able to do, in their words made precise.
- "Desired behavior:" how it should work / what it should look like.
- "Where:" the page / section in BloomOS, as specifically as known.${
        opts.hasPhoto ? `\n- "Screenshot:" note that a screenshot is attached for reference.` : ""
      }
- "Acceptance criteria:" a short checklist describing what "done" looks like.
- End with exactly: "Explore the codebase to find the relevant components, propose the smallest clean implementation that fits existing patterns, then build it and verify it."`
    : `The "prompt" (only in the ready object) must be a complete, self-contained brief for Claude Code working in this repository, written in second person to the coding agent, using these labeled sections:
- A one-line summary of the issue.
- "Observed behavior:" what currently happens, in the reporter's words made precise.
- "Expected behavior:" what should happen instead.
- "Where:" the page / section in BloomOS, as specifically as known.
- "Steps to reproduce:" numbered, if known.${
        opts.hasPhoto ? `\n- "Screenshot:" note that a screenshot is attached for reference.` : ""
      }
- "Acceptance criteria:" a short checklist describing what "fixed" looks like.
- End with exactly: "Investigate the root cause before changing code. Search the codebase to locate the relevant component or route, confirm the cause, then make the smallest correct fix and verify it."`;

  return `You are the intake assistant inside BloomOS, an internal admin dashboard (a Next.js 14 / TypeScript / Tailwind / Supabase web app). Non-engineer operators use you: Remi (the founder) and Shannon (head of admin), among others. The reporter is telling you about ${kind}. You briefly interview them to gather as much useful detail as possible, then write a precise prompt that can be pasted straight into Claude Code (an AI coding agent with full access to this codebase) to act on it.

How you work:
- Ask ONE short, concrete follow-up question at a time. Plain language, no engineering jargon. They are describing what they SEE on screen, not code.
- Across the whole interview, pin down: ${goals}
- Never re-ask something they already told you. If their first message already covers most of it, ask only what is genuinely missing.
- Keep it to at most ${MAX_QUESTIONS} questions total, and fewer whenever you can. The moment you have enough to write a specific, useful prompt, stop asking and finalize.
- Be warm and quick. One sentence per question.
${ctxLines.length ? `\nContext for this report:\n- ${ctxLines.join("\n- ")}` : ""}

ALWAYS reply with a single JSON object and nothing else:
- To ask the next question: {"action":"ask","message":"<your one short question>"}
- When you have enough: {"action":"ready","title":"<task title, max 70 chars>","prompt":"<the full Claude Code prompt>"}

${promptSpec}

Do not invent file names, components, or technical details the reporter did not give you — describe the need and let Claude Code locate the code. Never use em dashes anywhere.${capLine}`;
}

type Parsed =
  | { action: "ask"; message: string }
  | { action: "ready"; title: string; prompt: string };

function parseModel(text: string): Parsed | null {
  // The model returns a single JSON object (this model rejects assistant
  // prefill, so we can't prime the opening brace — instead we strip any code
  // fence and slice from the first { to the last } to tolerate stray prose).
  const stripped = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
  if (obj.action === "ready" && typeof obj.prompt === "string") {
    return {
      action: "ready",
      title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Report",
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
    type?: string;
    pageContext?: PageContext;
    hasPhoto?: boolean;
  } | null;

  const rawType = body?.type;
  const type: ReportType = rawType === "confusing" || rawType === "idea" ? rawType : "bug";
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
    type,
    pageContext: body?.pageContext ?? null,
    hasPhoto: Boolean(body?.hasPhoto),
    questionsAsked,
  });

  // The conversation must end with a user message (this model does not support
  // assistant prefill), which the client guarantees — every turn we run on ends
  // with the operator's latest answer.
  const messages = turns.map((t) => ({ role: t.role, content: t.content }));

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
      console.error("[report/debug] Anthropic error:", res.status, (await res.text()).slice(0, 500));
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
