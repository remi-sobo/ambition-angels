import Link from "next/link";
import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Segmented control for BloomOS — Visual System V3 §6, level 2.
 *
 * Plan & Close needs three DISTINCT levels of navigation, and the middle one
 * is a two-way switch between two modes of the same screen. A segmented
 * control says that ("these are two states of one thing") in a way that a pair
 * of pills does not ("these are two links among many").
 *
 * One recessed track, one raised selected segment. The track is the pill; the
 * segments are not — so this stays inside V3's rule that a 999px radius means
 * status/filter/badge/tag/count rather than "every control is a capsule".
 */

export type Segment<T extends string> = {
  value: T;
  label: ReactNode;
  /** Small qualifier under the label ("Monday · Aim"). */
  hint?: ReactNode;
  /** Renders a quiet "Now" marker — a non-color signal (§13). */
  marker?: ReactNode;
};

export default function SegmentedControl<T extends string>({
  segments,
  value,
  hrefFor,
  label = "View",
  className = "",
}: {
  segments: Segment<T>[];
  value: T;
  /** Link-driven so the choice lives in the URL and survives a refresh. */
  hrefFor: (value: T) => string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-stretch gap-1 rounded-control bg-tile border border-hairline p-1 ${className}`}
    >
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <Link
            key={s.value}
            href={hrefFor(s.value)}
            aria-current={active ? "true" : undefined}
            className={[
              "inline-flex items-center gap-2 rounded-[6px] px-3 py-1.5 transition-colors",
              TYPE.nav,
              active
                ? "bg-surface text-ink-1 font-semibold border border-hairline"
                : "text-ink-2 hover:text-ink-1 border border-transparent",
            ].join(" ")}
          >
            <span>{s.label}</span>
            {s.hint ? (
              <span className={active ? "text-xs text-ink-2" : "text-xs text-ink-3"}>
                {s.hint}
              </span>
            ) : null}
            {s.marker}
          </Link>
        );
      })}
    </div>
  );
}
