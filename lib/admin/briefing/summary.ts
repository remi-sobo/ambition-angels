/**
 * Section summary lines (spec Phase 5): the same BriefingItem signals, rendered
 * as one sentence at the top of a module page so each section answers its own
 * question. Pure sentence-building (summarize) + a thin server gatherer.
 */
import type { BriefingItem, BriefingSource } from "./types";
import { SEVERITY_RANK } from "./types";

export type SectionKey = "major_gifts" | "compliance" | "students" | "cohorts";
export type SummarySeverity = "critical" | "watch" | "due_soon" | "clear";
export type SectionSummary = { sentence: string; severity: SummarySeverity };

const SECTION_SOURCES: Record<SectionKey, BriefingSource[]> = {
  major_gifts: ["major_gifts"],
  compliance: ["compliance"],
  students: ["engagement"],
  cohorts: ["engagement"],
};

// What "all clear" reads as, per section — the positive state the spec asks for.
const CLEAR: Record<SectionKey, string> = {
  major_gifts: "Pipeline's clean — no asks need a move today.",
  compliance: "Nothing due or overdue in the compliance calendar.",
  students: "Students are progressing — no engagement gaps flagged.",
  cohorts: "Sessions are logged and attendance is current.",
};

/** Pure: turn a section's items into one sentence + the worst severity.
 *  `clearLines` lets the server caller substitute term-aware all-clear copy
 *  (e.g. "Kids are progressing" for an org that renamed Student). */
export function summarize(
  section: SectionKey,
  items: BriefingItem[],
  clearLines: Partial<Record<SectionKey, string>> = {},
): SectionSummary {
  const relevant = items.filter((it) => SECTION_SOURCES[section].includes(it.source));
  if (relevant.length === 0) {
    return { sentence: clearLines[section] ?? CLEAR[section], severity: "clear" };
  }

  const worst = relevant.reduce((a, b) =>
    SEVERITY_RANK[a.severity] <= SEVERITY_RANK[b.severity] ? a : b,
  );
  const sentence = relevant.map((it) => it.title).join(" · ");
  return { sentence, severity: worst.severity };
}

/** Server: gather the spine once, build the briefing, summarize the section. */
export async function getSectionSummary(section: SectionKey): Promise<SectionSummary> {
  const { gatherInputs } = await import("./gather");
  const { buildBriefing } = await import("./engine");
  try {
    const { inputs, states, dataAge } = await gatherInputs();
    const briefing = buildBriefing(inputs, dataAge, states);
    // Term-aware all-clear copy (nav-terminology fan-out): the participant
    // noun is per-org vocabulary, so "Students are progressing" follows it.
    const { getProgramTerms } = await import("@/lib/admin/terminology");
    const terms = await getProgramTerms();
    return summarize(section, briefing.items, {
      students: `${terms.students} are progressing — no engagement gaps flagged.`,
      cohorts: `${terms.sessions} are logged and attendance is current.`,
    });
  } catch {
    // Never let a summary line break the page it sits on.
    return { sentence: CLEAR[section], severity: "clear" };
  }
}
