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

## 2. Design tokens

Extend the existing Tailwind system (keep brand tokens; add product tokens):

| Token | Value | Use |
|---|---|---|
| `navy` / `--navy` | `#10214B` (sample from mockup; finalize from source file) | Sidebar, dark chrome |
| `navy-light` | lighter step | Sidebar hover/active fields |
| `orange` (existing) | `#E8500A` | Active nav item, primary CTAs, accent series |
| `cream` (existing) | `#FAFAF8` | Content background |
| `--chart-1..6` | orange, navy, teal, gold, slate, rose | shadcn/Recharts series |
| Status | green `#1E8E5A` / amber `#D97706` / red `#DC2626` | deltas, RAG status, alerts |
| Radii / cards | existing `rounded-card` (1.25rem), white cards, `shadow-sm`, 1px `gray-light` border | All dashboard widgets |

Typography: inside `.admin-shell` both `--font-heading` and `--font-display` resolve to **Space Grotesk** (`--font-grotesk`, see `app/layout.tsx` + `globals.css`) — the BloomOS product voice — with **DM Sans** (`font-body`) for body text. `.font-display` additionally forces uppercase, so it reads as "shouty Space Grotesk", not a different face; per `specs/bloomos-typography.md` D2/D3 the `font-display font-black` voice is retired from admin titles (page titles render via `PageHeader`, modals via `TYPE.modalTitle`). Poppins and Big Shoulders belong to the marketing site only. Numbers in dashboards use tabular-nums.

### Type scale

The one canonical type scale is the ten-role `TYPE` in `lib/admin/typeScale.ts` (`specs/bloomos-typography.md` §2, "bloomos-to-ten"). Sizes/weights/tracking are **never typed inline** — consume `TYPE` or a primitive (`PageHeader` / `SectionHeading` / `StatCard`). `tests/type-drift.test.ts` gates this across `app/admin/**`, and `tests/design-tokens.test.ts` freezes the values: changing a role updates the freeze and this table in the same commit.

| Role | Classes | Use |
|---|---|---|
| `pageTitle` | `font-heading font-bold text-2xl text-ink-1` | Page name — one per page, rendered only via `PageHeader` |
| `sectionHeader` | `font-heading font-semibold text-[11px] uppercase tracking-[0.14em] text-ink-3` | Small uppercase eyebrow above a group of rows/cards (`SectionHeading`) |
| `sectionTitle` | `font-heading font-bold text-lg text-ink-1` | Visible mid-weight section title inside a page |
| `cardTitle` | `font-heading font-bold text-sm text-ink-1` | Title of a card / panel |
| `modalTitle` | `font-heading font-bold text-lg text-ink-1` | Title of a modal / sheet |
| `cardMetric` | `font-heading font-semibold text-[28px] leading-none tracking-tight tabular-nums text-ink-1` | The big number on a stat card |
| `cardLabel` | `text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3` | Uppercase label above a metric |
| `body` | `text-sm text-ink-1` | Primary reading text |
| `bodyMuted` | `text-sm text-ink-2` | Supporting / descriptive text — the de-facto admin default |
| `metadata` | `text-[11px] text-ink-2` | Dates, owners, hints |

`sectionTitle` and `modalTitle` are intentionally identical strings today — separate roles so they can diverge without a migration. Margins/layout utilities are never part of the scale (append them: `` className={`${TYPE.cardTitle} mb-2`} ``). Roles carry their ink color; on dark/accent surfaces keep the role and append an important override (`!text-orange`, `!text-cream`) rather than forking the scale. Deliberate exemptions (D5): `LoginScreen`, the strategic-plan narrative deck, `Greeting.tsx` (starts from `TYPE.pageTitle`, appends `sm:text-3xl tracking-tight`), and `font-mono` for timestamps/amounts.

Component library: **shadcn/ui** (copy-owned) themed with these tokens — buttons, tables, dialogs, command palette, forms (react-hook-form + Zod), toasts, charts. Replaces ad-hoc admin components incrementally.

## 3. Layout system

- **Desktop:** fixed 248px sidebar (sections with 11px uppercase tracking labels, icon + 13px item rows; active = orange pill) · max-width ~1400px content · 12-col CSS grid for dashboard cards.
- **Mobile:** keep the existing drawer + top bar pattern (already good) + PWA shell. Field-critical screens (attendance check-in, task quick-add, contact log) get mobile-first treatment.
- **Page anatomy (every module page):** breadcrumb/title row with primary action → KPI strip (3–5 stat cards with delta chips) → content (table/board/detail) → right rail where useful (activity, AI panel).

## 4. Core UX patterns (binding)

1. **Stat card**: label (11px uppercase), value (28–32px semibold), delta chip (`↑ 17% vs last month`, green/red), optional sparkline. One component, used everywhere (mockup's top row).
2. **Draft-then-approve** is the universal AI affordance: AI output renders in an "AI draft" container (distinct tint + sparkle glyph + "Review" actions). Nothing AI-written leaves the org or mutates records without explicit approval.
3. **Pipelines** (fundraising stages, student journey, grants): same horizontal funnel/Kanban component — stage columns with count + $ value or %, drag to advance, stage-change side-effects confirmed in a sheet.
4. **Tables**: server-paginated, saved filter views, column picker, CSV export, bulk actions. Every entity list is this one table component.
5. **⌘K global search**: constituents, students, tasks, grants, documents, navigation, and "ask BloomOS" (agent) as the fallthrough.
6. **Empty states do onboarding**: each module's empty state explains the module, offers seed/import actions, and links the connected integration. Zero-config adoption is the #1 lesson from PM-tool churn research.
7. **Quiet by default**: one daily digest + in-app bell; per-user notification preferences; no notification firehose (Basecamp's calm-software lesson).
8. **Accessibility**: WCAG 2.1 AA target — contrast-checked tokens, full keyboard nav, focus rings, reduced-motion respect. (Districts increasingly require a VPAT; design for it now.)

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
