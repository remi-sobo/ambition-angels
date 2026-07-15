/**
 * The one canonical type scale for the BloomOS admin (specs/bloomos-typography.md
 * §3). Ten roles, one definition each, so headings/metrics/labels stop drifting
 * page to page. Central primitives (PageHeader, SectionHeading, StatCard) consume
 * these; call sites compose `TYPE.<role>` instead of retyping scale strings —
 * tests/type-drift.test.ts enforces this across app/admin.
 *
 * Roles carry their ink color; a call site that needs a different color on a dark
 * or accent surface appends an important override (e.g. `!text-cream`) after the
 * role rather than forking the scale (spec D3).
 */
export const TYPE = {
  /** Page name — one per module landing page. */
  pageTitle: "font-heading font-bold text-2xl text-ink-1",
  /** Editorial display voice for page titles (Finance, Meetings, Ops detail pages). */
  displayTitle:
    "font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none",
  /** Editorial display voice, larger step — module landing heroes. */
  displayTitleLg:
    "font-display font-black uppercase tracking-tight text-ink-1 text-4xl sm:text-5xl leading-none",
  /** One-line description under a page title. */
  pageSubtitle: "text-sm text-ink-2",
  /** Small kicker above a title (e.g. "Fiscal year 2026"). */
  eyebrow: "text-[10px] uppercase tracking-[0.25em] text-orange/80",
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
