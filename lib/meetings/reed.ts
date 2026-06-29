import "server-only";
import { TASK_CATEGORIES, type TaskCategory } from "@/app/admin/ops/_types/ops";
import { buildTranscriptPrompt, type TranscriptPromptInput } from "./transcript-prompt";

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

function coerceCategory(v: unknown): TaskCategory {
  return typeof v === "string" && (TASK_CATEGORIES as readonly string[]).includes(v)
    ? (v as TaskCategory)
    : "other";
}

export async function parseTranscript(input: TranscriptPromptInput): Promise<ReedResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const prompt = buildTranscriptPrompt(input);

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
