/**
 * AI transaction categorization — suggests a chart-of-accounts category for
 * each uncategorized bank transaction, with a confidence and a reusable
 * "contains" rule pattern so the user can make the categorization stick.
 *
 * Structured output via tool calling (same pattern as the funder-research
 * agent): the model calls `submit_categorizations` with a typed array, so
 * there's no free-text JSON to parse. Suggestions are advisory — nothing is
 * written here; the apply step does the writing after the user confirms.
 *
 * Model: claude-opus-4-8 with adaptive thinking at low effort — accurate on
 * ambiguous merchants without the latency/cost of deep reasoning per item.
 */
import Anthropic from "@anthropic-ai/sdk";

export const CATEGORIZE_MODEL = "claude-opus-4-8";

/** Max transactions per suggestion call — keeps tokens + latency bounded. */
export const SUGGEST_BATCH = 60;

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI categorization: ANTHROPIC_API_KEY must be set");
  cached = new Anthropic({ apiKey: key });
  return cached;
}

export type TxnForAI = { id: string; description: string; amount: number };
export type CategoryForAI = {
  id: string;
  display_name: string;
  group_name: string;
  kind: string;
  functional_class: string | null;
};
export type AiSuggestion = { id: string; category_id: string; confidence: number; rule_pattern: string };

const SYSTEM = `You categorize a nonprofit's bank transactions into its existing chart of accounts.

Rules:
- Assign each transaction the single best category by its id from the provided list. Use the id exactly; never invent one.
- OUTFLOW (money out) → an expense-kind category. INFLOW (money in) → a revenue-kind category. Match the kind to the direction.
- confidence is 0..1: how sure you are. Use < 0.5 when the description is vague or could fit several categories.
- If you genuinely cannot tell, set category_id to "" and confidence low — do not guess wildly.
- rule_pattern: a short, stable, lowercased substring of the description that identifies the merchant/source for a future "contains" match (e.g. "amazon", "pg&e", "adobe", "gusto"). Use "" when the description is a one-off with no stable merchant token (e.g. a check number, a person's name, a transfer).
Call submit_categorizations exactly once with one entry per transaction id.`;

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    categorizations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The transaction id, exactly as given." },
          category_id: { type: "string", description: "A category id from the list, or \"\" if unsure." },
          confidence: { type: "number", description: "0..1 confidence in this categorization." },
          rule_pattern: { type: "string", description: "Stable lowercased merchant substring, or \"\"." },
        },
        required: ["id", "category_id", "confidence", "rule_pattern"],
      },
    },
  },
  required: ["categorizations"],
} as const;

export async function suggestCategories(txns: TxnForAI[], categories: CategoryForAI[]): Promise<AiSuggestion[]> {
  if (txns.length === 0) return [];
  const client = getClient();

  const catLines = categories
    .map((c) => `- ${c.id} | ${c.display_name} | group: ${c.group_name} | ${c.kind}${c.functional_class ? ` | ${c.functional_class}` : ""}`)
    .join("\n");
  const txnLines = txns
    .map(
      (t) =>
        `- id=${t.id} | ${t.amount < 0 ? "OUTFLOW" : "INFLOW"} ${Math.abs(t.amount).toFixed(2)} | ${t.description.replace(/\s+/g, " ").slice(0, 160)}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: CATEGORIZE_MODEL,
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `CATEGORIES (id | name | group | kind | functional_class):\n${catLines}\n\nTRANSACTIONS:\n${txnLines}`,
      },
    ],
    // Schema-typed const trips the SDK's tool union; cast at the boundary
    // (same as the funder-research client). Anthropic validates the schema.
    tools: [
      {
        name: "submit_categorizations",
        description: "Submit the category assignment for every transaction. Call exactly once.",
        input_schema: TOOL_SCHEMA,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
  });

  let toolUse: Anthropic.Messages.ToolUseBlock | null = null;
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_categorizations") toolUse = block;
  }
  if (!toolUse) return [];

  const input = toolUse.input as { categorizations?: unknown };
  const raw = Array.isArray(input.categorizations) ? input.categorizations : [];
  const known = new Set(categories.map((c) => c.id));

  const out: AiSuggestion[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const category_id = typeof o.category_id === "string" && known.has(o.category_id) ? o.category_id : "";
    if (!id || !category_id) continue; // drop unknowns / abstentions
    const confidence = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0;
    const rule_pattern = typeof o.rule_pattern === "string" ? o.rule_pattern.trim().toLowerCase().slice(0, 60) : "";
    out.push({ id, category_id, confidence, rule_pattern });
  }
  return out;
}
