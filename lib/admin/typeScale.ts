/**
 * The one canonical type scale for the BloomOS product — Visual System V3 §2.
 *
 * ONE face (Instrument Sans, wired to `--font-instrument` and collapsed onto
 * the display/heading/body slots inside `.admin-shell`), and a fixed ladder of
 * roles instead of one-off pixel values scattered across 480+ screens.
 *
 *   Display / page title  28px / 600
 *   H2 (section title)    20px / 600
 *   H3 (subsection)       17px / 600
 *   Card title            15px / 600
 *   Body                  14px / 400
 *   Navigation            14px / 500
 *   Button                13px / 600
 *   Metadata / helper     12px / 450-500
 *   Badge                 11-12px / 600
 *
 * V3 rules encoded here:
 *  - No 10px type. Every muted-small role sits at the 12px floor.
 *  - Letter spacing is quiet: the uppercase eyebrow drops from 0.14em to
 *    0.06em, and nothing else tracks at all.
 *  - Uppercase is used sparingly — `sectionHeader` is the only uppercase role
 *    left. `cardLabel` became sentence case, because a stat label is read, not
 *    decorated.
 *  - Helper text is `ink-2`, never `ink-3`, wherever it carries meaning (§13:
 *    "avoid overly light gray helper text"). `ink-3` is for genuinely inert
 *    text only, and still clears AA.
 *
 * Central primitives (PageHeader, SectionHeading, Card, StatCard, Button,
 * Tabs, Badge) consume these; every other call site composes `TYPE.<role>`
 * instead of retyping scale strings — tests/type-drift.test.ts enforces this
 * across app/admin, and tests/design-tokens.test.ts freezes the values (change
 * a role → update the freeze and docs/bloomos/06-design-system.md in the same
 * commit).
 *
 * Margins/layout utilities are never part of the scale; call sites append them
 * (`className={`${TYPE.cardTitle} mb-2`}`). A site that keeps a role's scale
 * but needs a different color on a dark/accent surface appends an important
 * override (e.g. `!text-cream`) — the idiom StatCard already uses.
 */
export const TYPE = {
  /** Page name — one per page, rendered only via PageHeader. 28px/600. */
  pageTitle: "font-heading font-semibold text-[28px] leading-tight tracking-[-0.02em] text-ink-1",
  /** Visible section title inside a page (the H2 step). 20px/600. */
  sectionTitle: "font-heading font-semibold text-xl leading-snug tracking-[-0.01em] text-ink-1",
  /** Subsection heading (the H3 step). 17px/600. */
  subsectionTitle: "font-heading font-semibold text-[17px] leading-snug text-ink-1",
  /** Small uppercase eyebrow above a group of rows/cards (SectionHeading).
   *  The ONLY uppercase role left; 12px, quiet tracking, readable ink-2. */
  sectionHeader:
    "font-heading font-semibold text-xs uppercase tracking-[0.06em] text-ink-2",
  /** Title of a card / panel. 15px/600. */
  cardTitle: "font-heading font-semibold text-[15px] leading-snug text-ink-1",
  /** Title of a modal / sheet. 18px/600. */
  modalTitle: "font-heading font-semibold text-lg leading-snug text-ink-1",
  /** The big number on a stat card. 28px/600, tabular. */
  cardMetric:
    "font-heading font-semibold text-[28px] leading-none tracking-[-0.02em] tabular-nums text-ink-1",
  /** Label above a metric. Sentence case now (V3 §2: uppercase sparingly). */
  cardLabel: "text-xs font-medium text-ink-2",
  /** Primary reading text. 14px/400. */
  body: "text-sm text-ink-1",
  /** Supporting / descriptive text — the de-facto product default. */
  bodyMuted: "text-sm text-ink-2",
  /** Secondary metadata (dates, owners, hints). 12px floor. */
  metadata: "text-xs text-ink-2",
  /** Navigation item — sidebar rows, tabs. 14px/500. */
  nav: "text-sm font-medium",
  /** Button label. 13px/600. */
  button: "text-[13px] font-semibold",
  /** Badge / status chip label. 12px/600. */
  badge: "text-xs font-semibold",
} as const;
