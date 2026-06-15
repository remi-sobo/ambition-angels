/**
 * The one canonical type scale for the BloomOS admin (spec Phase 3). Six roles,
 * one definition each, so headings/metrics/labels stop drifting page to page.
 * Central primitives (PageHeader, SectionHeading, StatCard) consume these; the
 * per-page rollout migrates ad-hoc sizes onto them.
 */
export const TYPE = {
  /** Page name — one per module landing page. */
  pageTitle: "font-heading font-bold text-2xl text-ink-1",
  /** Section header above a group of cards. */
  sectionHeader:
    "font-heading font-semibold text-[11px] uppercase tracking-[0.14em] text-ink-3",
  /** The big number on a stat card. */
  cardMetric:
    "font-heading font-semibold text-[28px] leading-none tracking-tight tabular-nums text-ink-1",
  /** Uppercase label above a metric. */
  cardLabel:
    "text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3",
  /** Default reading text. */
  body: "text-sm text-ink-1",
  /** Secondary metadata (dates, owners, hints). */
  metadata: "text-[11px] text-ink-2",
} as const;
