import {
  editionCompleteness,
  type Completeness,
  type FilledSlot,
} from "./formats";

/**
 * Compiling an edition into the plain text an email campaign carries
 * (spec §6.5, §7.4).
 *
 * Everything here is pure. The route resolves stories and metrics from the
 * database and hands them in; this file decides what the reader sees.
 *
 * ── What compile deliberately does NOT do ───────────────────────────────────
 * It does not append the org footer, the mailing address, or the unsubscribe
 * link. buildCampaignEmail() already does all three at send time, for
 * campaigns and journeys alike. Stitching them in here would print each of
 * them twice in every email — the spec's §6.5 sentence about "the org's
 * footer" predates that helper existing.
 *
 * It also does not touch recipients, segments, or suppression. Compile makes
 * a draft; the existing send path owns everything after that, which is how
 * one suppression list and one deliverability reputation stay one of each.
 */

/** A story as compile needs it — read from v_publishable_stories, never `stories`. */
export type CompileStory = {
  id: string;
  title: string;
  body: string | null;
  outcome: string | null;
};

/** A metric with its latest snapshot resolved. */
export type CompileMetric = {
  id: string;
  name: string;
  unit: string | null;
  latest: number | null;
  captured_on: string | null;
  stale: boolean;
};

export type CompileInput = {
  slots: readonly FilledSlot[];
  storiesById: Map<string, CompileStory>;
  metricsById: Map<string, CompileMetric>;
};

export type CompileResult = {
  body: string;
  /** Things worth saying out loud before someone sends this. */
  warnings: string[];
  /** Reasons compile must refuse. Non-empty means no campaign is created. */
  blocked: string[];
  completeness: Completeness;
};

/** The existing create route's cap; compile respects it rather than discovering it. */
export const MAX_BODY = 20_000;

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** 1234.5 → "1,234.5"; 47 → "47". No currency guessing — the unit says it. */
export function formatValue(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function renderMetric(m: CompileMetric): string {
  if (m.latest === null) return `${m.name}: not captured yet`;
  const v = formatValue(m.latest);
  const unit = m.unit ? ` ${m.unit}` : "";
  return `${m.name}: ${v}${unit}`;
}

/**
 * Does this slot print its label as a heading?
 *
 * A newsletter section wants one. A letter does not: an appeal that prints
 * "The opening" above its first line has stopped being a letter and become a
 * form. Kind decides, so a tenant that renames every slot still gets this
 * right without configuring anything.
 */
export function printsHeading(kind: string): boolean {
  return kind !== "letter" && kind !== "ask";
}

/** One slot's final text: the slot's own copy wins, the story is the fallback. */
export function slotText(slot: FilledSlot, storiesById: Map<string, CompileStory>): string {
  const own = (slot.content ?? "").trim();
  if (own) return own;
  const story = slot.story_id ? storiesById.get(slot.story_id) : undefined;
  if (!story) return "";
  return [story.body, story.outcome].map((s) => (s ?? "").trim()).filter(Boolean).join("\n\n");
}

export function compileEdition(input: CompileInput): CompileResult {
  const { slots, storiesById, metricsById } = input;
  const completeness = editionCompleteness(slots);
  const warnings: string[] = [];
  const blocked: string[] = [];

  if (slots.length === 0) blocked.push("This edition has no slots.");
  for (const label of completeness.requiredMissing) {
    blocked.push(`"${label}" is required and still empty.`);
  }

  const ordered = [...slots].sort((a, b) => a.position - b.position);
  const parts: string[] = [];

  for (const slot of ordered) {
    const def = slot.slot_def;

    if (def.kind === "metrics") {
      const ids = slot.metric_ids ?? [];
      const lines: string[] = [];
      for (const id of ids) {
        const m = metricsById.get(id);
        if (!m) {
          warnings.push(`A metric in "${def.label}" no longer exists and was left out.`);
          continue;
        }
        if (m.latest === null) {
          warnings.push(`"${m.name}" has no captured value yet — it will read as blank.`);
        } else if (m.stale && m.captured_on) {
          warnings.push(`"${m.name}" was last captured ${fmtDate(m.captured_on)}.`);
        }
        lines.push(renderMetric(m));
      }
      if (lines.length === 0) continue;
      parts.push([printsHeading(def.kind) ? def.label : "", ...lines].filter(Boolean).join("\n"));
      continue;
    }

    // A story_id the publishable map doesn't answer for is the consent case
    // the spec calls out (§10): consent lapsed between filling this slot and
    // compiling it. The route builds this map from v_publishable_stories, so
    // "missing" means exactly "not publishable right now" — and it blocks with
    // a named reason rather than quietly sending an edition with a hole in it.
    if (slot.story_id && !storiesById.has(slot.story_id)) {
      blocked.push(
        `"${def.label}" holds a story that can't be used any more — it needs to be approved, and everyone in it needs current consent.`,
      );
      continue;
    }

    const text = slotText(slot, storiesById);
    if (!text) {
      // An optional empty slot is a decision, not an error: it just isn't in
      // this edition. Required ones are already in `blocked` above.
      continue;
    }
    parts.push([printsHeading(def.kind) ? def.label : "", text].filter(Boolean).join("\n\n"));
  }

  let body = parts.join("\n\n\n").trim();
  if (body.length > MAX_BODY) {
    body = body.slice(0, MAX_BODY);
    warnings.push(`This edition is longer than ${MAX_BODY.toLocaleString("en-US")} characters and was trimmed.`);
  }
  if (!body && blocked.length === 0) blocked.push("There is nothing in this edition to send yet.");

  return { body, warnings, blocked, completeness };
}
