/**
 * The one canonical type scale for the BloomOS admin — the ten roles of
 * specs/bloomos-typography.md §2 ("bloomos-to-ten"). One definition per role,
 * so headings/metrics/labels stop drifting page to page. Central primitives
 * (PageHeader, SectionHeading, StatCard) consume these; every other call site
 * composes `TYPE.<role>` instead of retyping scale strings —
 * tests/type-drift.test.ts enforces this across app/admin, and
 * tests/design-tokens.test.ts freezes the values (change a role → update the
 * freeze and docs/bloomos/06-design-system.md in the same commit).
 *
 * Margins/layout utilities are never part of the scale; call sites append
 * them (`className={`${TYPE.cardTitle} mb-2`}`). A site that keeps a role's
 * scale but needs a different color on a dark/accent surface appends an
 * important override (e.g. `!text-orange`) — the idiom StatCard already uses.
 */
export const TYPE = {
  /** Page name — one per page, rendered only via PageHeader. */
  pageTitle: "font-heading font-bold text-2xl text-ink-1",
  /** Small uppercase eyebrow above a group of rows/cards (SectionHeading). */
  sectionHeader:
    "font-heading font-semibold text-[11px] uppercase tracking-[0.14em] text-ink-3",
  /** Visible mid-weight section title inside a page (was ad-hoc text-lg). */
  sectionTitle: "font-heading font-bold text-lg text-ink-1",
  /** Title of a card / panel (was ad-hoc text-sm, 45+ sites). */
  cardTitle: "font-heading font-bold text-sm text-ink-1",
  /** Title of a modal / sheet (replaces the uppercase display voice). */
  modalTitle: "font-heading font-bold text-lg text-ink-1",
  /** The big number on a stat card. */
  cardMetric:
    "font-heading font-semibold text-[28px] leading-none tracking-tight tabular-nums text-ink-1",
  /** Uppercase label above a metric. */
  cardLabel:
    "text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3",
  /** Primary reading text. */
  body: "text-sm text-ink-1",
  /** Supporting / descriptive text — the de-facto admin default. */
  bodyMuted: "text-sm text-ink-2",
  /** Secondary metadata (dates, owners, hints). */
  metadata: "text-[11px] text-ink-2",
} as const;
