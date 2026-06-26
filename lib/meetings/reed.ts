import "server-only";
import { TASK_CATEGORIES, type TaskCategory } from "@/app/admin/ops/_types/ops";

/**
 * Reed — the meetings agent. Parses a pasted/uploaded transcript into a short
 * summary plus 1–3 concrete follow-up suggestions. Reed only proposes; nothing
 * becomes a live task until a human accepts (suggestions land in the staging
 * table). Model: claude-sonnet-4-6, matching the career-quiz routes.
 *
 * NB: Reed is the BloomOS product AI. Read.ai is a third-party notetaker we may
 * integrate later — do not conflate them.
 */

export type ReedSuggestion = { title: string; category: TaskCategory };
export type ReedResult = { summary: string; suggestions: ReedSuggestion[] };

const MODEL = "claude-sonnet-4-6";
const MAX_TRANSCRIPT_CHARS = 12_000;

function coerceCategory(v: unknown): TaskCategory {
  return typeof v === "string" && (TASK_CATEGORIES as readonly string[]).includes(v)
    ? (v as TaskCategory)
    : "other";
}

export async function parseTranscript(input: {
  title: string | null;
  transcript: string;
  attendees?: string[];
}): Promise<ReedResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const who = input.attendees?.length ? `\nAttendees: ${input.attendees.join(", ")}` : "";
  const prompt = `You are Reed, the operations AI for a nonprofit CEO. Read this meeting transcript and produce:
1. A 2–3 sentence summary of what was discussed and decided.
2. 1 to 3 concrete follow-up tasks the operator should do, each a short imperative title.

Categories must be one of: ${TASK_CATEGORIES.join(", ")}.

Return ONLY minified JSON, no prose, no code fences, in exactly this shape:
{"summary":"...","suggestions":[{"title":"...","category":"fundraising"}]}

Meeting title: ${input.title ?? "(untitled)"}${who}
Transcript:
${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Reed transcript parse failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const raw = String(data?.content?.[0]?.text ?? "").replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Reed returned non-JSON output");
  }

  const obj = parsed as { summary?: unknown; suggestions?: unknown };
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const suggestions: ReedSuggestion[] = Array.isArray(obj.suggestions)
    ? obj.suggestions
        .slice(0, 3)
        .map((s) => {
          const o = s as { title?: unknown; category?: unknown };
          return {
            title: typeof o.title === "string" ? o.title.trim().slice(0, 200) : "",
            category: coerceCategory(o.category),
          };
        })
        .filter((s) => s.title.length > 0)
    : [];

  return { summary, suggestions };
}
