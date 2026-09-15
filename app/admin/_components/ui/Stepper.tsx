"use client";

import { TYPE } from "@/lib/admin/typeScale";

/**
 * Horizontal stepper for BloomOS — Visual System V3 §6, level 3.
 *
 * Replaces the five pill-shaped workflow items (Orient / Carryover / Areas /
 * Days / Commit) that read as "another navigation bar" stacked under two other
 * navigation bars. A stepper communicates PROGRESS: numbered nodes joined by a
 * connector, the title under each number.
 *
 *   1 ●────2────3────4────5
 *
 *  - active   → terracotta node, ink title
 *  - complete → success treatment with a check
 *  - future   → neutral, quiet
 *
 * §13, status is never color alone: a complete step carries a checkmark glyph,
 * the active step carries `aria-current="step"`, and every node keeps its
 * number/label. The connector between two complete steps fills in, so progress
 * is legible in greyscale.
 *
 * §7 responsive note: below `sm` the row becomes a vertical progression, which
 * is the only way five labelled nodes stay readable on a phone.
 */

export type StepState = "complete" | "active" | "upcoming";

export type StepItem = {
  key: string;
  label: string;
};

function nodeClasses(state: StepState): string {
  switch (state) {
    case "active":
      // The one place the vivid accent carries a label: white on #C96B38 at
      // 13px/700 is below the AA small-text floor, so the active node uses the
      // AA `orange` fill (--accent-ink) and the vivid accent stays on the ring.
      return "bg-orange text-white ring-4 ring-accent/20";
    case "complete":
      return "bg-revenue text-white";
    default:
      return "bg-tile text-ink-2 border border-hairline";
  }
}

export default function Stepper({
  steps,
  current,
  onStep,
  label = "Progress",
  className = "",
}: {
  steps: StepItem[];
  /** Index of the active step. */
  current: number;
  onStep?: (index: number) => void;
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-col sm:flex-row sm:items-start gap-0 sm:gap-0">
        {steps.map((s, i) => {
          const state: StepState =
            i < current ? "complete" : i === current ? "active" : "upcoming";
          const isLast = i === steps.length - 1;
          const interactive = Boolean(onStep) && i <= current;
          const Node = (
            <span
              className={`inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-full text-sm font-semibold tabular-nums transition-colors ${nodeClasses(
                state,
              )}`}
            >
              {state === "complete" ? (
                <svg
                  viewBox="0 0 16 16"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden
                >
                  <path d="M3 8l3.2 3.2L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
          );

          return (
            <li
              key={s.key}
              aria-current={state === "active" ? "step" : undefined}
              className="flex sm:flex-col sm:flex-1 sm:items-center gap-3 sm:gap-0 min-w-0"
            >
              {/* Node + connector. On desktop the connector is a horizontal
                  rule either side of the node; on mobile it is the vertical
                  spine to the left of the label. */}
              <div className="flex sm:w-full flex-col sm:flex-row items-center shrink-0">
                <span
                  aria-hidden
                  className={`hidden sm:block h-[2px] flex-1 ${
                    i === 0 ? "opacity-0" : i <= current ? "bg-revenue" : "bg-hairline"
                  }`}
                />
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onStep?.(i)}
                    className="rounded-full focus-visible:outline-offset-4"
                    aria-label={`Go to step ${i + 1}: ${s.label}`}
                  >
                    {Node}
                  </button>
                ) : (
                  Node
                )}
                <span
                  aria-hidden
                  className={`sm:hidden w-[2px] flex-1 min-h-[18px] ${
                    isLast ? "opacity-0" : i < current ? "bg-revenue" : "bg-hairline"
                  }`}
                />
                <span
                  aria-hidden
                  className={`hidden sm:block h-[2px] flex-1 ${
                    isLast ? "opacity-0" : i < current ? "bg-revenue" : "bg-hairline"
                  }`}
                />
              </div>

              <span
                className={`${TYPE.metadata} sm:mt-2 sm:text-center truncate max-w-full pb-3 sm:pb-0 ${
                  state === "active"
                    ? "!text-ink-1 font-semibold"
                    : state === "complete"
                      ? "!text-ink-2"
                      : "!text-ink-3"
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
