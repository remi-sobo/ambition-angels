/**
 * Mission proof — manually-entered, dated figures.
 *
 * Recon (Phase 0) confirmed the program/impact outcomes the cockpit wants —
 * Future-Orientation lift, second-internship completion, adults engaged — are
 * NOT queryable in BloomOS. They live as published evaluation numbers
 * (lib/stats.ts), not a live pipeline. Per the spec, the mission widget degrades
 * honestly to a dated manual figure and never fabricates a computed metric.
 *
 * When a real program-data pipeline lands, replace this with a loader and set
 * `queryable: true`; the widget already distinguishes the two.
 */
import { STATS } from "@/lib/stats";

export type MissionMetric = { value: string; label: string; note?: string };

export type MissionProof = {
  hero: MissionMetric;
  secondary: MissionMetric;
  /** Adults-engaged is not tracked anywhere yet, so there's no honest third. */
  optional?: MissionMetric;
  /** When these manual figures were last reviewed — shown to the CEO. */
  asOf: string;
  /** Whether the numbers come from a live query (false = manually entered). */
  queryable: false;
};

export const MISSION_PROOF: MissionProof = {
  hero: {
    value: STATS.futureOrientation.value,
    label: "Future-orientation lift",
    note: STATS.futureOrientation.note,
  },
  secondary: {
    value: STATS.secondInternship.value,
    label: "Start a second internship",
  },
  asOf: "2025 program evaluation",
  queryable: false,
};
