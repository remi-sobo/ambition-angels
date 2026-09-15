# 06 — UX / UI & Design System

## 1. Information architecture (from the approved mockup)

Left sidebar, seven labeled sections. This IA is the product's table of contents and maps 1:1 to module docs:

```
BloomOS — Operating System for Ambition Angels

COMMAND CENTER          FINANCE                 OPERATIONS
  Overview                Revenue                 Team
  Executive Briefing      Expenses                Meetings
                          Cash Flow               Projects
PROGRAM                   Budget vs Actual        Documents
  Students
  Schools               DATA                    GOVERNANCE
  Ambition App            Website Analytics       Board
  Internships             App Analytics           KPIs
  Career Readiness        Student Analytics       Strategic Plan
                          Surveys                 (Compliance)*
FUNDRAISING
  Donors
  Major Gifts
  Grants
  Campaigns
  Events
```

\* Compliance lives under Governance (it exists today at `/admin/compliance`; the mockup omits it — we keep it).

Top bar: date · global search (⌘K) · notifications bell · org/user avatar. Footer: *BloomOS™ — All-in-one operating system for nonprofits. Data, Finance, Fundraising, Programs, Impact. Built by SOBO Consulting.* Support: `support@bloomos.co` (placeholder).

**Tenant theming:** sidebar header = "Operating System for {org}"; org logo top-right; accent color configurable per org (defaults to Ambition Angels orange). BloomOS chrome (deep navy sidebar) stays constant — the mockup's navy-on-cream is the product identity.

## 2. Design tokens — Visual System V3

The product owns typography, espresso navigation, surfaces, layout, spacing,
interaction patterns and shape language. A tenant owns only its **name, logo
and one accent color** — so BloomOS must render a different organization
without visually breaking. Components therefore never hard-code a hex: they
consume the semantic tokens below through Tailwind.

Source of truth: `.admin-shell` in `app/globals.css` (custom properties) +
`tailwind.config.ts` (the token → utility mapping). `tests/design-tokens.test.ts`
freezes both and computes the contrast ratios in CI, so a token change has to
be deliberate and has to update this table in the same commit.

### Surfaces, text, borders

| Token | Value | Use |
|---|---|---|
| `--bg-app` / `app` | `#F7F4EE` | Workspace background (cleaner, less beige than the V2 `#F5EFE2`) |
| `--bg-surface` / `surface` | `#FFFDF9` | Card / panel surface |
| `--bg-tile` / `tile` | `#FBF8F2` | Recessed tile — inputs, stat wells, hover |
| `--bg-sidebar` / `navy` | `#1C1814` | Espresso navigation (the product's most recognizable element) |
| `--bg-sidebar-raised` / `navy-light` | `#2A241E` | Sidebar hover + active row tint |
| `--text-primary` / `ink-1` | `#29241F` | Primary ink |
| `--text-secondary` / `ink-2` | `#746C63` | Secondary / helper text |
| `--text-tertiary` / `ink-3` | `#756C5B` | Genuinely inert text only |
| `--sidebar-text` | `#F3EDE4` | Sidebar label |
| `--sidebar-muted` | `#A89B8D` | Sidebar inactive label |
| `--border-subtle` / `hairline` | `#E3D9CB` | The DEFAULT border: dividers, card edges, chart axes |
| `--border-strong` / `outline` | `#CDBEAA` | Signal only: selected, editable, attention |

### Accent (the one tenant-ownable hue) and semantic status

| Token | Value | Use |
|---|---|---|
| `--accent` / `accent` | `#C96B38` | **Fill only** — left indicator, tab underline, dots, chart marks |
| `--accent-ink` / `orange` | `#9D532C` | Text, links, **and** filled buttons under a white label |
| `--accent-hover` / `orange-dark` | `#7D4223` | Hover for both |
| `--accent-soft` / `orange-light` | `#F5E5DB` | Pale tint |
| `--success` / `revenue`, `status.healthy` | `#32745B` | Healthy |
| `--warning` / `status.watch` | `#A96820` fill · `#965C1C` text | Watch |
| `--danger` / `status.critical` | `#C24B40` fill · `#AE4339` text (`expense`) | Critical |

**The fill/text split, and why it exists.** The V3 brief's literal `--accent`
(#C96B38), `--warning` (#A96820), `--danger` (#C24B40) and `--text-tertiary`
(#948A7E) land at **3.09–4.37:1** on the workspace and fail WCAG AA as small
text. §3 of the brief permits tuning; §13 requires the contrast. So each hue
keeps its vivid value for anything that is a *mark* — a dot, a bar, a 3px
indicator, a chart series — and gains a deepened step for anything that is
*type*. Same hue family, same visual relationship, AA everywhere. The gate
holds text steps to 4.5:1 on `app`/`surface`/`tile` **and** on their own pale
tint, fill-only tokens to the 3:1 non-text floor (WCAG 1.4.11), and any fill
that carries a white label to 4.5:1 against white.

Charts are the one place a raw hex is unavoidable (SVG `fill`/`stroke` cannot
take a class), so they import `lib/admin/chartTokens.ts` — a mirror of these
values, pinned to them by the same test.

### Shape and elevation

| Token | Value | Use |
|---|---|---|
| `rounded-control` | 9px | Buttons, inputs, selects, small controls |
| `rounded-panel` / `-lg` | 14px / 16px | Cards, list containers, feature panels |
| `rounded-modal` | 18px | Modals, sheets |
| `rounded-full` | 999px | **Reserved**: statuses, filters, badges, tags, counts — nothing else |

Shadows are not decoration. `shadow-panel` / `shadow-tile` resolve to `none`:
cards read through surface contrast + a hairline border. Real elevation uses
`.elevate-menu` (dropdowns, floating menus) and `.elevate-modal` (modals,
overlays) from `globals.css`.

**Spacing** comes off one scale — `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`
(Tailwind `1 / 2 / 3 / 4 / 6 / 8 / 12 / 16`). More air between major sections,
less padding inside small controls.

### Typography

One face: **Instrument Sans**, loaded in `app/layout.tsx` as
`--font-instrument`. Inside `.admin-shell` the display, heading AND body slots
all resolve to it, so no product screen can reach a second face. `.font-display`
no longer forces uppercase in the product. Poppins, Big Shoulders and DM Sans
belong to the marketing site only. The BloomOS logo stays its existing image
asset and is deliberately not matched to the interface face. Numbers use
tabular-nums.

The canonical scale is `TYPE` in `lib/admin/typeScale.ts`. Sizes/weights/
tracking are **never typed inline** — consume `TYPE` or a primitive.
`tests/type-drift.test.ts` gates this across `app/admin/**`.

> `lib/**` is in the Tailwind `content` globs. It has to be: the scale's
> arbitrary values (`text-[28px]`, `text-[15px]`, `text-[17px]`) exist only in
> that file, and without the glob they are never generated — the page title
> silently renders at inherited 16px.

| Role | Classes | Use |
|---|---|---|
| `pageTitle` | `font-heading font-semibold text-[28px] leading-tight tracking-[-0.02em] text-ink-1` | Page name — one per page, via `PageHeader` |
| `sectionTitle` | `font-heading font-semibold text-xl leading-snug tracking-[-0.01em] text-ink-1` | H2 — section title inside a page |
| `subsectionTitle` | `font-heading font-semibold text-[17px] leading-snug text-ink-1` | H3 |
| `sectionHeader` | `font-heading font-semibold text-xs uppercase tracking-[0.06em] text-ink-2` | The ONLY uppercase role left (`SectionHeading`) |
| `cardTitle` | `font-heading font-semibold text-[15px] leading-snug text-ink-1` | Title of a card / panel |
| `modalTitle` | `font-heading font-semibold text-lg leading-snug text-ink-1` | Title of a modal / sheet |
| `cardMetric` | `font-heading font-semibold text-[28px] leading-none tracking-[-0.02em] tabular-nums text-ink-1` | The big number on a stat card |
| `cardLabel` | `text-xs font-medium text-ink-2` | Label above a metric — sentence case now |
| `body` | `text-sm text-ink-1` | Primary reading text |
| `bodyMuted` | `text-sm text-ink-2` | Supporting text — the de-facto default |
| `metadata` | `text-xs text-ink-2` | Dates, owners, hints |
| `nav` | `text-sm font-medium` | Sidebar rows, tabs |
| `button` | `text-[13px] font-semibold` | Button label |
| `badge` | `text-xs font-semibold` | Badge / status chip |
| `tableHeader` | `text-xs font-semibold uppercase tracking-[0.06em] text-ink-2` | Table column header |
| `fieldLabel` | `text-xs font-medium text-ink-1` | Form field label (what `Field` renders) |

V3 type rules: **no 10px type** (every muted-small role sits on the 12px
floor); letter spacing is quiet (the eyebrow dropped 0.14em → 0.06em, the
PageHeader eyebrow 0.25em → 0.04em, and `tracking-widest` — 0.1em — is gone
from every live surface); helper text is `ink-2`, never `ink-3`, wherever it
carries meaning.

**Uppercase is used sparingly — exactly two roles have it:** `sectionHeader`
(a group eyebrow) and `tableHeader` (a column header, one row per table, where
it genuinely aids scanning). Both sit at 0.06em. Everything else is sentence
case, including stat labels (`cardLabel`) and form labels (`fieldLabel`) —
a label you read or type against is not decoration. `tests/type-drift.test.ts`
pins `tracking-widest` so the old micro-label voice cannot return. Deliberate exemptions
(D5): `LoginScreen`, the strategic-plan narrative deck, `Greeting.tsx`, and
`font-mono` for timestamps/amounts.

## 3. The primitive library

`app/admin/_components/ui/` is the shared foundation; `ui/index.ts` is its
front door. **A screen never re-styles a primitive locally** — if a treatment
is missing, it is added here. That rule is the whole point of the V3 pass.

`PageShell` · `PageSection` · `PageHeader` · `SectionHeading` · `Card`
(+`CardHeader`/`CardMetric`/`CardFooter`) · `StatCard` · `EmptyState` ·
`Alert` · `Modal` · `Button` (+`ButtonLink`) · `Input` (+`Field`/`Select`/
`Textarea`/`Checkbox`) · `Tabs` · `SegmentedControl` · `Stepper` ·
`SidebarItem` · `ListRow` (+`ListRows`) · `Badge`/`StatusBadge`/`CountBadge` ·
`StatusChip`/`CategoryTag`/`ScoreBadge`.

## 4. Layout and core UX patterns (binding)

- **Workspace width:** `max-w-workspace` = **1280px** (was ~1100px, which left
  a dead desktop gutter while content columns stayed cramped).
  `max-w-reading` = 900px for long-form, single-column screens.
- **Desktop:** fixed 248px espresso sidebar · `PageShell` gutters (16px, 32px
  from `lg`) · card grids on the 24px gap.
- **Mobile:** drawer + top bar + bottom tab bar + PWA shell. Touch targets are
  44px (WCAG 2.5.5), not 40px.

**The three navigation levels** — a screen must never stack three lookalike pill
rows again:

1. **Work navigation tabs** — `Tabs`: text, generous spacing, active weight, a
   terracotta underline on the container rule. No capsules.
2. **Mode switch** (e.g. Plan / Close) — `SegmentedControl`: one recessed
   track, one raised selected segment.
3. **Workflow progress** — `Stepper`: numbered nodes joined by a connector
   (`1 ●────2────3────4────5`), title under each number, terracotta active,
   success check for complete, neutral ahead; a vertical progression on mobile.

**The card architecture** (§8 of the brief): every card in the product is built
from the same five slots, in the same order — `title → metric → meta → status →
action` — so Money Health, Mission Health and My Day read as one system.

**List rows** carry a fixed priority: **title**, then status/due, then the
contextual why-line. An overdue row does *not* repaint itself red; the title
holds its ink and red survives only in the badge. Red is a signal, not a
typeface.

Other binding patterns, unchanged: **draft-then-approve** as the universal AI
affordance · **pipelines** as one shared funnel/Kanban · **tables**
server-paginated with saved views · **⌘K global search** · **empty states do
onboarding** · **quiet by default** (one daily digest, no firehose).

**Accessibility (WCAG 2.1 AA target, gated in CI):** contrast-checked tokens ·
an obvious two-tone keyboard focus ring scoped to `.admin-shell` (and switched
to the vivid accent on the espresso sidebar) · status never communicated by
color alone — every status carries a dot, a glyph or a word, and `aria-current`
carries active state · 44px touch targets · no helper text below 12px ·
`Modal` traps focus, restores it to the opener, and closes on Escape.

## 5. The Command Center widget grid (from mockup, full inventory)

Greeting: "Good {daypart}, {Org}." + "Here's what's happening across your mission today."

| Widget | Content | Source |
|---|---|---|
| KPI strip (5) | Students Served · Active School Partners · Revenue Raised · Weekly Engagement · **Organizational Health n/100** | metric registry; health = composite (see modules/01) |
| Financial Health | Revenue/Expenses/Net Surplus + deltas, donut by category, Cash on Hand, **Months of Runway** + trend sparkline | Finance module cache |
| Fundraising Pipeline | funnel: Prospects → Cultivation → Proposal → Committed (count + $ each) + total pipeline value | opportunities + grants |
| Upcoming Priorities | next 5: grant deadlines, board meeting, compliance due, project milestones — each links into its module | grant_requirements, compliance_items, tasks, board_meetings |
| Website Analytics | visitors, conversion, email signups, top page + trend line | page_views/click_events |
| Ambition App Analytics | active students, opportunities applied, simulations, challenges, mentor connections, hours logged | app events ingestion |
| Recent Wins | auto-detected: grant awarded, new school partner, milestone counts | event stream |
| Student Journey Pipeline | Discover → Learn → Practice → Connect → Launch with counts + conversion % | enrollments stages |
| Top Career Interests | donut from quiz/app data | quiz_submissions/app |
| Team Pulse | team engagement, meeting completion, project completion % | ops + meetings |

All widgets are metric-registry renderers on the react-grid-layout grid; org default layout ships per the mockup; users can rearrange/hide (per-user override).

## 6. Voice & microcopy

Encouraging, plain-English, mission-aware ("across your mission today", "Recent wins"), never enterprise-speak. Numbers always contextualized (delta vs last period, or vs target). AI speaks as "BloomOS" and always shows its sources ("based on 14 transactions in March").
