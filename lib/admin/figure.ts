import type { MetricRenderState } from "@/lib/admin/metrics/render";

/**
 * The render decision behind <Figure> (spec §2 principle 3: "Every figure
 * says where it came from and how fresh it is. Missing is never shown as
 * zero"; §6 "Figure: every displayed number goes through Metric").
 *
 * PURE, so the rule that matters most, missing is not zero, is tested
 * without rendering anything (tests/kit-figure.test.ts).
 *
 * States:
 *   fresh    the value, with its source line in muted text
 *   stale    the value, an "Out of date" badge, the source line in warning
 *            text, and a Refresh action when the page offers one
 *   partial  the value, a "Partial" badge: some inputs are missing, so the
 *            number is a floor, not the whole answer
 *   missing  NO number. "No data yet" in place of the value, and the source
 *            line says what would fill it. A value of null/undefined/""/NaN
 *            is missing whatever freshness the caller claims.
 */
export type Freshness = "fresh" | "stale" | "partial" | "missing";

export type FigureValue = number | string | null | undefined;

export const MISSING_TEXT = "No data yet";

export type FigureView = {
  state: Freshness;
  /** The text to render as the number, or null when missing. */
  valueText: string | null;
  /** The placeholder shown instead of a number. */
  missingText: string | null;
  badge: "Out of date" | "Partial" | null;
  sourceTone: "muted" | "warning";
  showRefresh: boolean;
};

export function isMissingValue(value: FigureValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isNaN(value);
  return value.trim() === "";
}

/** Numbers get thousands separators; strings ("$186,400", "7.4 months") pass
 *  through untouched. Zero is "0", never blank. */
export function formatFigureValue(value: number | string): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : value;
}

export function figureView({
  value,
  freshness = "fresh",
  canRefresh = false,
}: {
  value: FigureValue;
  freshness?: Freshness;
  canRefresh?: boolean;
}): FigureView {
  if (freshness === "missing" || isMissingValue(value)) {
    return {
      state: "missing",
      valueText: null,
      missingText: MISSING_TEXT,
      badge: null,
      sourceTone: "muted",
      showRefresh: canRefresh,
    };
  }
  const valueText = formatFigureValue(value as number | string);
  if (freshness === "stale") {
    return { state: "stale", valueText, missingText: null, badge: "Out of date", sourceTone: "warning", showRefresh: canRefresh };
  }
  if (freshness === "partial") {
    return { state: "partial", valueText, missingText: null, badge: "Partial", sourceTone: "muted", showRefresh: false };
  }
  return { state: "fresh", valueText, missingText: null, badge: null, sourceTone: "muted", showRefresh: false };
}

/**
 * Bridge from the Contract 2 metric catalog (<Metric>'s render state) to a
 * Figure: a defined metric with no snapshot is missing, a stale snapshot is
 * stale. An undefined key has no figure at all (null): the caller keeps
 * <Metric>'s refusal chip for that case.
 */
export function figureFromMetricState(
  state: MetricRenderState,
): { value: string | null; freshness: Freshness; capturedOn: string | null } | null {
  if (state.kind === "undefined") return null;
  if (state.display === null) return { value: null, freshness: "missing", capturedOn: null };
  const stale = state.flags.some((f) => f.flag === "stale-value");
  return { value: state.display, freshness: stale ? "stale" : "fresh", capturedOn: state.capturedOn };
}
