import { fmtUsd } from "./render";

/**
 * Machine gates for generated cards (specs/ms-career-library-v2.md
 * "Machine gates"). A draft that fails any gate is rejected and
 * regenerated before a human ever looks at it. The gates exist so Remi's
 * review time goes to judgment, not to catching obvious failures.
 *
 * The gates NEVER set a card to approved. Only a human click does that.
 */

export type GateInput = {
  title: string;
  titleVariants: string[];
  field: string | null;
  dayVignette: string | null;
  clues: (string | null)[]; // clue_1 .. clue_8 in order
  payMedian: number | null;
};

export type GateFailure = { gate: string; detail: string };

export type GateResult = {
  passed: boolean;
  failures: GateFailure[];
  readingGrade: number | null; // Flesch-Kincaid grade of the vignette
};

export const MAX_READING_GRADE = 6.0;
const MIN_CLUE8_LENGTH = 60; // a giveaway needs a concrete detail, not a shrug

/** Words that identify the industry per field — clue 1 must stay vague. */
const FIELD_GIVEAWAYS: Record<string, string[]> = {
  health: ["hospital", "medical", "medicine", "healthcare", "health care", "patient", "clinic"],
  tech: ["software", "computer", "tech", "app", "coding", "code", "digital"],
  business: ["business", "company", "corporate", "sales", "marketing"],
  creative: ["design", "art", "creative", "studio"],
  trades: ["construction", "trade", "workshop", "job site"],
  public: ["government", "city hall", "public service"],
};

/**
 * Whole-phrase, case-insensitive containment with word boundaries, so
 * "art" does not fire inside "part" but "surgical tech" fires inside
 * "a surgical tech's day".
 */
export function containsTerm(text: string, term: string): boolean {
  const cleaned = term.trim();
  if (!cleaned) return false;
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(text);
}

function findTerm(text: string, terms: string[]): string | null {
  for (const t of terms) if (containsTerm(text, t)) return t;
  return null;
}

/**
 * Flesch-Kincaid grade level. The syllable counter is the standard
 * heuristic (vowel groups, silent trailing e, -le endings) — crude but
 * monotone enough to gate a 150-word vignette. FK grade =
 * 0.39*(words/sentences) + 11.8*(syllables/words) − 15.59.
 */
export function fleschKincaidGrade(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z'-]/g, ""))
    .filter(Boolean);
  if (sentences.length === 0 || words.length === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
}

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/e$/, "").replace(/ed$/, "");
  const groups = stripped.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  if (/le$/.test(w) && !/[aeiouy]le$/.test(w)) count++;
  return Math.max(1, count);
}

export function runGates(input: GateInput): GateResult {
  const failures: GateFailure[] = [];
  const titleTerms = [input.title, ...input.titleVariants].filter(Boolean);

  // All eight clues present and non-empty.
  input.clues.forEach((clue, i) => {
    if (!clue || !clue.trim()) {
      failures.push({ gate: "clues_present", detail: `clue_${i + 1} is empty` });
    }
  });
  if (!input.dayVignette || !input.dayVignette.trim()) {
    failures.push({ gate: "vignette_present", detail: "day_vignette is empty" });
  }

  const vignette = input.dayVignette ?? "";
  const clue1 = input.clues[0] ?? "";
  const clue7 = input.clues[6] ?? "";
  const clue8 = input.clues[7] ?? "";

  // The vignette never names the job.
  const vignetteHit = findTerm(vignette, titleTerms);
  if (vignetteHit) {
    failures.push({ gate: "vignette_names_job", detail: `vignette contains "${vignetteHit}"` });
  }

  // Clue 1 is the hardest clue: no title, no variant, no industry word.
  const clue1TitleHit = findTerm(clue1, titleTerms);
  if (clue1TitleHit) {
    failures.push({ gate: "clue1_names_job", detail: `clue_1 contains "${clue1TitleHit}"` });
  }
  const industryTerms = input.field ? FIELD_GIVEAWAYS[input.field] ?? [] : [];
  const clue1IndustryHit = findTerm(clue1, industryTerms);
  if (clue1IndustryHit) {
    failures.push({
      gate: "clue1_names_industry",
      detail: `clue_1 contains industry word "${clue1IndustryHit}"`,
    });
  }

  // Clue 8 is the near-giveaway: concrete, specific, but still not the title
  // (the title is THE ANSWER, revealed after).
  if (clue8.trim() && clue8.trim().length < MIN_CLUE8_LENGTH) {
    failures.push({
      gate: "clue8_not_specific",
      detail: `clue_8 is ${clue8.trim().length} chars; a giveaway needs a concrete detail (≥ ${MIN_CLUE8_LENGTH})`,
    });
  }
  const clue8Hit = findTerm(clue8, titleTerms);
  if (clue8Hit) {
    failures.push({ gate: "clue8_names_job", detail: `clue_8 contains "${clue8Hit}"` });
  }

  // Clue 7 must carry the real median — it is rendered, so drift here means
  // the renderer and the data disagree, which is a bug worth failing on.
  if (input.payMedian != null && clue7.trim() && !clue7.includes(fmtUsd(input.payMedian))) {
    failures.push({
      gate: "clue7_pay_mismatch",
      detail: `clue_7 does not contain ${fmtUsd(input.payMedian)}`,
    });
  }

  // Reading grade: written for a sixth grader, enforced, not hoped.
  let readingGrade: number | null = null;
  if (vignette.trim()) {
    readingGrade = Math.round(fleschKincaidGrade(vignette) * 10) / 10;
    if (readingGrade >= MAX_READING_GRADE) {
      failures.push({
        gate: "vignette_reading_grade",
        detail: `vignette reads at grade ${readingGrade}; must be under ${MAX_READING_GRADE}`,
      });
    }
  }

  return { passed: failures.length === 0, failures, readingGrade };
}
