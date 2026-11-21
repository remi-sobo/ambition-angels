# V4 Phase 0, Track 1: UX, design system, navigation

Commit: HEAD `dff62859` on `claude/awesome-carson-7k5f1w`. It is base `37472e56` plus the brief file only (`git diff --stat 37472e56 HEAD` shows one file, the brief), so every finding holds for `main 37472e56`.
Method: read-only code audit with grep counts. I did not run the app. Visual states (pill stacking, mobile sheets, real widths on screen) are marked needs-runtime-access.
Tags: **V** = verified in code, **A** = assumption, **RT** = needs runtime access.

## Top findings

| # | Pri | Finding | Evidence | Tag |
|---|---|---|---|---|
| 1 | P1 | **The shared kit is good but barely adopted.** The `ui/` barrel (Button, Input, Modal, Tabs, Card…) is imported by 25 of 530 admin `.tsx` files. There are 269 hand-rolled orange primary buttons in 144 files against 42 `<Button>` uses in 12 files. There are 440 raw `<input>` in 113 files against 104 `<Field>` uses in 15 files. 27 files hand-roll `fixed inset-0` overlays and only 2 use `ui/Modal`. | grep counts below | V |
| 2 | P1 | **The "one table component" has almost no live users.** `DataTable` is imported by `DonorsTable` (on `/admin/fundraising/donors`, which 308s, so it is dead) and `ProspectsTable` (live only inside the Research drawer, behind `ai.prospect_research`). The real Donors & Funders list (`donors-funders/page.tsx:227,325`) is a hand-rolled `<table>` with its own server-backed, URL-driven `SavedViews`. That version is the better pattern. DataTable keeps saved views in `localStorage` (per device, despite its "per user" comment), paginates on the client only, and has no mobile layout. | `DataTable.tsx:13-18,116-132`; `SavedViews.tsx:1-5` | V |
| 3 | P1 | **Settings has no home.** `/admin/settings` holds only account items, Google, working hours and data sources. About 12 configuration screens are scattered and several are orphaned: `finance/rules` (no link anywhere), `fundraising/settings` (linked only from a dead page), `meetings/booking-page` (reachable only through Cmd-K), `strategic-plan/setup`, `acknowledgments/templates`, `fundraising/duplicates`, two import wizards, `finance/upload`, `budget/import`, `howto`. `v2routes.ts` already marks most of them `at-cutover → settings` (lines 160-175), but that seat was never built. There is no invite or terminology UI anywhere in admin. | `settings/page.tsx:99-250`, route table | V |
| 4 | P1 | **Help and search still describe the V1 product to every tenant.** Cmd-K's page list (`search/types.ts:105-147`) has 22 V1 paths and V1 labels ("Overview", "Executive Briefing", "Ask Log", "Monday Plan", "Students", "YGB Camp") and no entitlement filter, so SafeSpace is shown YGB Camp and Demo Day. `/admin/howto` (395 lines) is organized under "Command Center" and "Executive Briefing", links 13 V1 paths, and is not entitlement-filtered either. | `howto/page.tsx:20-48` | V |
| 5 | P1 | **There is a dead link in the persistent chrome.** The sidebar footer links "V2" to `/admin/v2` (`V2Sidebar.tsx:166`). That page was deleted in #524 (`72aeb37a`), so every user in every tenant sees a footer link that 404s. The footer also says "built by SOBO Consulting". | `git log --diff-filter=D -- app/admin/v2` | V |
| 6 | P1 | **Internal spec jargon appears in UI copy.** Finance → Reports and Impact → Reports share the same subtitle: "Draft always; flag unresolved figures inline; block only the exit (Contract 7)." | `finance/reports/page.tsx:154`, `impact/reports/page.tsx:159` | V |
| 7 | P2 | **268 in-app links point at V1 paths that 308.** They sit in 134 files, for example `/admin/fundraising/donors/…` (38), `/admin/strategic-plan` (22) and `/admin/ops/projects` (21). Each costs an extra hop, and labels drift ("← Pledges" lands on Finance → Forecast, `pledges/[id]/page.tsx:78`). | v1hits count | V |
| 8 | P2 | **About 2,700 lines of dead UI ship.** 9 page files sit behind 308s and are not reused: `fundraising/donors` 595, `fundraising/plan` 367, `ops/my-week` 144, `recurring` 133, `journeys` 109, `queue` 92, `briefing` 83, `volunteers` 83, `program` 9. On top of that: the whole `_components/overview/` folder (17 files, 1,042 lines), `CommandCenter.tsx`, and `Pipeline.tsx` (0 imports). Three live screens are orphaned by these dead pages: `fundraising/plan/[id]` (309 lines), `briefing/weekly`, `fundraising/reports`. | route table | V |
| 9 | P2 | **Numbers have four renderers and only one enforces provenance.** `Metric` (the Contract 2 renderer: a number only through a defined metric key) has 4 files. `StatCard` has 37, `CardMetric` 2, and raw `text-2xl`+ appears 53 times in 31 files. The brief's "never hardcode numbers" rule is enforced only where `Metric` is used. | grep | V |
| 10 | P2 | **Detail pages have no shared header.** There are three patterns: `TYPE.pageTitle !text-lg` (board, students, compliance), full `pageTitle` (cohorts), and `PageHeader` (staff, meetings). Some pages render a list-title h1 ("Grants", "Ask Log", "Donors") above the record (`grants/[id]/page.tsx:59`, `AskDetail.tsx:61`, `DonorProfile.tsx:138`). There are no breadcrumbs, and the 16 hand-rolled "←" back links are styled differently from each other. | grep | V |

Already good enough, keep as the standard: the color and token discipline (0 raw Tailwind palette colors, 9 arbitrary hexes, a contrast gate in CI), the type scale (`TYPE` used in 213 files, h1 drift gated), the feedback layer (`useToast` in 87 files, `useConfirm` in 50, `lib/admin/errors` in 108, zero `alert()`/`window.confirm`), `ui/Modal` (focus trap, Escape, focus return, bottom sheet on phones), `PageHeader` (86 files), `EmptyState` (46 call sites), `FeatureGate` permission panel, the nav model plus redirect map plus tests, and the URL-driven `FilterTabs`.

## 1. Navigation assessment

**The seven-destination model holds up.** Home 2 tabs, Work 6, Programs 8, Fundraising 6, Finance 5, Impact 4, Organization 4, plus Inbox (Inbox, Messages) as a utility and Settings/How-To in the footer. Landing tabs are computed and empty destinations hide (V, `nav.ts`, `v2shellNav.ts`). The problems are below the tab row, not in it:

| Issue | Detail | Pri | Tag |
|---|---|---|---|
| Same label, different things | Two tabs named "Today" (Home, Fundraising). The Fundraising tab says "Today" but the page title is "Today's Moves". Two tabs named "Reports" (Finance, Impact) plus an orphan third (`fundraising/reports`). "Strategy" (Organization) vs "Fundraising Strategy" (funder angles, no home). "Campaigns" means gift-table goal plans while Comms sends email "campaigns". | P1 | V |
| People live in three places | Programs → People (students), Fundraising → Donors & Funders (constituents, and volunteers via `?view=volunteers`), Organization → Team. Volunteers sitting under Fundraising surprises a program manager. | P2 | V |
| Several "what needs me" surfaces | Home → Today, Fundraising → Today's Moves, Inbox, `/admin/reed` review inbox, Organization Health. | P2 | V |
| Programs is the widest row | 8 tabs for AA. Coach and Content are AA-only (`aa.coach`, `modules.content`), so AA sees the widest row and pilots see 6. | P3 | V |
| Home has a thin second tab | Organization Health (65 lines) could become a Today panel or join Impact. Home would then be one page with no tab row. | P3 | A |
| Tab row plus in-page pill rows | Donors & Funders stacks the tab row, `FilterTabs` view pills and the saved-view strip. That may break the "never three lookalike rows" rule in `06-design-system.md` §4. | P2 | RT |

**Comms as an eighth destination: yes, with conditions.** Its audience (outside the org) and its job (story to send to results) differ from Fundraising's (gifts and asks). Today Comms is a 6th Fundraising tab that only appears with `modules.comms`. Conditions:
1. Move in: Comms (sends), acknowledgment letters and `ack_templates` (now at `acknowledgments/letters` and `/templates` under Fundraising Today), the reserved journeys seat (`journeys` 308s to Donors & Funders, with no UI), and the story bank when it lands.
2. Keep in Fundraising: Campaigns (rename it, for example "Campaign plans" or "Goals", so the word "campaign" belongs to one place), Pipeline, Grants, Donors & Funders.
3. Rename Inbox → Messages to "Team messages" or similar so it cannot be confused with Comms.
4. Mobile: keep the bar as Today, Work, +, Fundraising, More. Comms goes in More, with story capture as a + action.
5. Count: 8 destinations for AA. A tenant without `modules.comms` still sees 7. That is acceptable. Do not add any other destination.

**Fold into Settings (seat exists in `v2routes` already):** `fundraising/settings` and `stages`, `finance/rules`, `finance/config`, `meetings/booking-page` (`/admin/meet` redirects to it), `strategic-plan/setup`, `acknowledgments/templates` (or Comms), `fundraising/duplicates`, `imports` plus `fundraising/import` (merge them into one wizard), `finance/upload`, `finance/budget/import`, `howto` (as Help). Settings then needs sections for Account, Organization (identity, terminology, users), Data sources and Module settings.

## 2. Component adoption and duplication

| Component | Adoption | Hand-rolled equivalent | Verdict |
|---|---|---|---|
| `ui/Button` (+`_components/Button` shim) | 42 uses / 12 files | 842 raw `<button>` in 198 files. 269 orange primary CTAs in 144 files. 51 pill CTAs. Worst: `strategic-plan/_components/PlanControls.tsx` (41), `BoardControls` (18), `ComplianceDetailControls` (17) | **Extend:** add a `loading` state, icon-only, a `link` variant, and 44px touch size on mobile (sm is 32px and md is 36px, which contradicts the doc's 44px claim). Then standardize. |
| `ui/Input`/`Field`/`Select` | 104 `<Field>` in 15 files | 440 `<input>`/113 files, 180 `<select>`/83, 76 `<textarea>`/51. Worst: `PlanControls` (20), `PartnerProfileControls` (20), `ConstituentControls` (18) | **Extend:** wire `aria-describedby` to the hint and error text (0 uses today, 4 `aria-invalid`), and add a date field. Good otherwise. |
| `ui/Modal` | 2 files (+`LevelDrawer` via barrel) | 27 files with `fixed inset-0`. Examples: `TaskEditModal`, `QuickAddModal`, `ReportModal`, `OpportunityEditModal`, `AddProspectModal`, `NewMessageModal`, `CaptureModal`, `ResearchDrawer`, `DocumentEditModal` | **Standard as is.** Add a `drawer` (right, full height) variant and `aria-labelledby` for non-string titles. Its backdrop hardcodes `#29241F` (`Modal.tsx:99`). |
| `ui/Tabs` | 1 (V2TabZone) | `FilterTabs` (7 files, URL-driven pills), `DemoDayTabs` | Tabs is fine for the tab row. **Make `FilterTabs` the standard view/filter control** (server-rendered, shareable URLs). |
| `ui/SegmentedControl`, `Stepper`, `ListRow` | 1 each | not counted | Fine. Adoption is low because few places need them. |
| `ui/Card` (+`CardMetric`) | 6 files | `bg-surface border rounded-panel` cards everywhere | **Standardize** for new work. Migration is P3. |
| `ui/PageShell` | 3 pages (today, capture, gift-tables) | 51 files `max-w-workspace`, 16 `max-w-[1400px]`, 59 files other `max-w-[Npx]` (640 to 1100), 42 files `max-w-2xl..5xl` | **Standardize.** It is the only thing that fixes widths (§3). |
| `PageHeader` | 86 files, 126 calls (33 with actions) | Detail pages hand-roll their h1 (finding 10) | **Extend:** add `back`/breadcrumb and `meta` slots, or add a `DetailHeader` sibling. |
| `StatCard` | 37 | 53 raw big numbers in 31 files | Good visually. Decide its relationship to `Metric` (§V4 decision). |
| `Metric` | 4 | see above | The provenance renderer. Should back StatCard for outcome numbers. |
| `EmptyState` | 46 calls, about 12 with `action` | 48 ad hoc "No X yet" strings. Misused as a permission state ("No access yet", `staff/reviews/page.tsx:17`) | Good. Add a `tone="permission"` or route those to FeatureGate. |
| `DataTable` | 2 importers, about 0 reachable (finding 2) | 35 raw `<table>` in 25 files (`legacy` 5, `AnalyticsView` 3, `donors-funders` 2, `budget/import` 2) | **Rebuild around the Donors & Funders pattern**: URL state, server-backed saved views (`segments`), server pagination, a mobile card layout, bulk actions. |
| `PageSkeleton` | 4 `loading.tsx` (root, finance, fundraising, programs) | 64 inline "Loading…" strings, 5 files `animate-pulse` | Fine at segment level. In-component loading needs a small `<InlineLoading>`. |
| `StatusChip` | 13 | `meetings/_ui.tsx` StatusPill, `Badge`/`StatusBadge` | Two chip systems (`StatusChip` and `ui/Badge`). Merge into one. |
| `StageBoard` | 3 (grants, opportunities, partners) | none | Good, keep. |
| `Pipeline`, `StageStrip` | 0, 3 | n/a | Delete `Pipeline.tsx`. |
| `QuickAddModal`, `ReportModal` | 2 each (V2QuickAdd, V2MobileBar) | n/a | Fine, but they hand-roll overlays. |

**Duplicate implementations (V):**

| Idea | Copies | Pri |
|---|---|---|
| CSV import | `imports/_components/ImportWizard.tsx` (272, generic, Settings) and `fundraising/import/_components/ImportWizard.tsx` (331, donors and gifts). Plus `finance/budget/import` (384), `finance/upload`, `prospects/import` (HubSpot) | P1 |
| Create or edit a task | `QuickAddModal`, `fundraising/_components/TaskComposer`, `TaskEditModal`, `EntityTasks` all POST `/api/admin/ops/tasks`. Today's `OpsTaskPanel` also edits tasks | P2 |
| Saved views | `DataTable` (localStorage) vs `donors-funders/_components/SavedViews` (segments table) | P1 |
| Module UI kit | `meetings/_ui.tsx` (STATUS, Avatar, StatusPill, SectionTitle) duplicates StatusChip, SectionHeading and an avatar used elsewhere (`V2Sidebar.tsx:131`) | P3 |
| Dashboards | `CommandCenter` plus 17 overview widgets (dead) vs Today | P2 |
| Permission state | `FeatureGate` panel vs 12 bare "Not authorized." divs (`strategic-plan/page.tsx:113`, `settings/page.tsx:58`) vs 45 "Sign in to view…" branches | P2 |

## 3. UX inconsistency inventory

| Type | Count | Examples | Pri | Tag |
|---|---|---|---|---|
| Page width | 20+ distinct caps | `max-w-[1400px]` on Fundraising (`donors-funders/page.tsx`, `pipeline/page.tsx:20`) vs `max-w-workspace` 1280 elsewhere, `max-w-[760px]` settings, `[820px]` org health, `5xl` meetings | P2 | V |
| Page frame | 43 `min-h-screen bg-ink` wrappers in 29 files vs PageShell in 3. `bg-ink` means cream inside `.admin-shell` | `fundraising/import/page.tsx:9`, `analytics/page.tsx:9` | P3 | V |
| Header pattern | PageHeader 86 files. Custom sticky header `analytics/page.tsx:10`. h1 with TYPE `messages/page.tsx:29`. Detail h1s (finding 10) | | P2 | V |
| Tables | 35 raw tables, 1 `aria-sort`, no mobile layout on any | `ops/projects/page.tsx`, `BookingHistory.tsx` | P1 | V (mobile RT) |
| Modals | 27 hand-rolled overlays, 12 `aria-modal` total | `TaskComposer.tsx`, `AiCategorize.tsx`, `calendar/BlockPanel.tsx` | P1 | V |
| Forms and validation | 80 `<form>`, 116 `required`, 4 `aria-invalid`, 0 `aria-describedby`, 81 native date inputs | `GrantControls.tsx`, `BookingPageSettings.tsx` | P1 (a11y) | V |
| Loading | 4 segment skeletons. 64 inline "Loading…" with mixed ink (`ink-3` in `EntityTasks.tsx:171`, `ink-2` in `EntityDocuments.tsx:202`) | | P2 | V |
| Empty | 46 EmptyState vs 48 ad hoc strings | | P2 | V |
| Error | `errors.ts` in 108 files. 316 inline critical-text uses with no shared inline error | | P3 | V |
| Success | `useToast` 87 files. "Saving…/Saved" text in 68 places, mixed with toasts | | P3 | V |
| Permission | FeatureGate vs bare "Not authorized." (12) vs EmptyState "No access yet" | | P2 | V |
| Big numbers | StatCard 37, Metric 4, CardMetric 2, raw 31 files | | P2 | V |
| Color and status | Clean: 0 raw palette colors, status scale enforced by tests | | ok | V |
| Action placement | 33 of 126 PageHeaders use `actions`. Other actions sit in body rows or ad hoc toolbars | `donors-funders/page.tsx:164` (import link in body) | P2 | V |
| Search, filter, sort, bulk | 20 search inputs, 4 sort controls, bulk only in DataTable/prospects/campaign/letters. Filters are URL-driven on 29 pages | | P1 | V |
| Back navigation | 16 "←" links, 3 styles, no breadcrumbs | `objective/[id]/page.tsx:128`, `CloseSection.tsx:93` | P2 | V |

**Archetype map (live pages):**

| Archetype | Pages |
|---|---|
| Dashboard | today, organization-health, programs/overview, fundraising/today, finance/snapshot, finance/forecast, impact/outcomes, impact/kpis, impact/analytics, organization/strategy |
| List | work/tasks, work/projects, work/meetings, work/documents, programs/people, intake, cohorts, attendance, content, coach, careers/daily, careers/pool, donors-funders, companies, campaigns, comms, finance/transactions, finance/budget, compliance, board, inbox, staff/reviews, fundraising/strategy, reed |
| Board | fundraising/pipeline, grants (board + list), programs/partners |
| Detail | board/[id], people/[id], partners/[id], cohorts/[id], session/[id], compliance/[id], projects/[id], meetings/[id], upcoming/[eventId], donors-funders/[id], pipeline/[id], grants/[id], comms/[id], gift-tables/[id], pledges/[id], strategy/[key], objective/[id], team/[id], capture/[id], reviews/[cycleId], by-hubspot/[id] |
| Form | imports, fundraising/import, budget/import, finance/upload, prospects/import, strategic-plan/setup, strategy/review, finance/reports, impact/reports |
| Settings | settings, fundraising/settings, stages, finance/rules, finance/config, booking-page, acknowledgments/templates |
| **Fits none** | work/my-week (calendar), work/plan-close (ritual stepper), organization/team (org chart), inbox/messages (chat), strategic-plan/narrative (presenter), acknowledgments/letters (print), howto (help), demoday, ygb, legacy |

Recommendation: add **Wizard/flow** (plan-close, imports, setup) and **Calendar** as two more archetypes. Treat chat, print and presenter as one-off exceptions.

## 4. Stale specs and docs

| Doc | Stale claim | Reality | Tag |
|---|---|---|---|
| `docs/bloomos/06-design-system.md` §1 | IA is "Command Center, Program, Fundraising, Finance, Data, Operations, Governance", with a top bar and notification bell | Seven V2 destinations plus Inbox. No top bar on desktop | V |
| same §4 | "tables server-paginated with saved views", "pipelines as one shared funnel/Kanban", 44px touch targets, WCAG 2.1 | DataTable is client-side and localStorage. `Pipeline.tsx` is unused. Button md is 36px and the Modal close is 32px. The brief targets 2.2 | V |
| same §5 | Command Center widget grid on react-grid-layout | Not in `package.json`. CommandCenter is dead | V |
| same §1 | support `redacted@example.invalid` (placeholder) | Settings mails `remi@ambitionangels.org` (`settings/page.tsx:228`) | V |
| `specs/bloomos-typography.md` line 3 | "approved spec, not yet built" | Built: `TYPE` roles exist and `tests/type-drift.test.ts` enforces phase 4.2 | V |
| `specs/bloomos-v2-spec-quality-floor.md` | "zero loading/error/not-found", "141 alert()", "44 re-exports" | `loading.tsx` ×4, `error.tsx`, `not-found.tsx` exist. 0 alert. 28 re-export hosts. DoD 6 (every panel empty state has an action) is not met (about 12 of 46) | V |
| `specs/bloomos-v2-spec-b-shell.md` §Mobile | bottom bar "Today, Work, +, Programs, More". "(v2) route group and flag" | Fundraising replaced Programs (`v2shellNav.ts:120`). The flag page was deleted but its footer link remains | V |
| `CLAUDE.md` brand section | `navy #10214B` admin chrome, Poppins/DM Sans | Admin uses espresso `#1C1814` and Instrument Sans inside `.admin-shell` | V |

## 5. Tests V4 must work with

| Test | Freezes | V4 impact |
|---|---|---|
| `tests/design-tokens.test.ts` | globals.css custom properties, the `TYPE` scale, contrast ≥4.5:1, no 8/9px type | Any token or type change updates the freeze and `06-design-system.md` in the same commit |
| `tests/type-drift.test.ts` | h1 only via PageHeader/TYPE, display-black allowlist, retired heading literals | A new `DetailHeader` must consume `TYPE.pageTitle`, or be allowlisted |
| `tests/nav-v2.test.ts` | exactly seven destination keys in order (line 58) | Adding Comms is a deliberate edit to this assertion |
| `tests/v2-shell.test.ts` | per-org tab counts, landing tabs, every tab resolves to a page on disk, seatless set empty | Moving tabs into Comms rewrites the Fundraising and Comms rows. It does not check footer links (it missed `/admin/v2`) |
| `tests/redirects-v2.test.ts` | next.config matches the map, one hop, stored notification URLs resolve | Every move needs a map row plus config row, and old URLs keep resolving |
| `tests/copy-voice.test.ts` | no em dash in rendered admin copy | New copy has to comply. It does not catch spec jargon ("Contract 7") |
| `nav-terminology`, `v2-quickadd`, `capture-ui-fence`, `gift-table-nav` | terminology labels, Quick Add, capture UI, gift-table nav | Run them on every nav change |

Suggested addition: a test that every literal `/admin/...` href in `app/admin` and `lib/admin` resolves to a page or an intended redirect, and is not a V1 source.

## V4's biggest design-system decision

**Pick one way to show any record list and adopt it everywhere: the URL-driven, server-backed pattern from Donors & Funders (FilterTabs, segments saved views, server pagination), packaged as the new DataTable with a mobile card layout.** Lists are about half the product. Today the "standard" table is effectively unused, and each list reinvents search, filter, views and empty states. Second in line, decide whether StatCard routes through `Metric` so every number has provenance.

---

## Appendix: route inventory (all 149 `page.tsx`/`page.jsx` under `app/admin`)

Type: **R** real page · **H** host (re-export or thin wrapper of a V1 source) · **S** V1 source whose URL 308s (code is used through its host) · **D** dead (URL 308s and the page code is not reused) · **Stub** thin wrapper whose URL 308s.
Linked: **N** nav tab · **P** in-page link · **Q** Cmd-K page list · **Hw** How-To · **F** sidebar footer · **none**.
Gate: inherited layout feature key. `—` = none (auth only).

| Route | What | Type | Linked from | Gate | Verdict |
|---|---|---|---|---|---|
| /admin | login or forward to Today | R (auth redirect) | logo | — | keep |
| /admin/[...not_found] | admin 404 | R | n/a | — | keep |
| /admin/today | Today | R | N Home>Today | — | keep |
| /admin/organization-health | org health rows | R | N Home>Org Health | — | keep. Consider folding into Today or Impact (P3) |
| /admin/inbox | notifications | R | N Inbox | — | keep |
| /admin/inbox/messages | team chat | H→messages | N Inbox>Messages | modules.messages | keep. Rename "Team messages" if Comms ships |
| /admin/messages | chat source | S | P (5 V1 links) | modules.messages | fold into host (P3) |
| /admin/settings | account settings | R | F, mobile More, Q | — | keep. Grow into the real Settings (P1) |
| /admin/howto | help page | R | F, Q | — | rewrite for V2, filter by entitlement (P1) |
| /admin/reset-password | password reset | R | auth email | — | keep |
| /admin/reed | Reed review inbox | R | Reed panel | ai.reed | keep (utility) |
| /admin/capture/[id] | capture card | R | capture flow | — | keep |
| /admin/imports | generic CSV wizard | R | Settings, People | program or fundraising | keep as the one import, in Settings |
| /admin/legacy | V0 monolith (quiz submissions, donations) | R, 1,495 lines | none (dead widget only) | aa.quiz | needs a home for quiz submissions, then remove (P2) |
| /admin/ygb | YGB camp registrations | R (.jsx, inline styles) | Q, Hw | aa.ygb | candidate to remove (demo tenant) (P3) |
| /admin/demoday | Demo Day tracker | R | Q, Hw | aa.demoday | needs a home (cohorts group view undesigned) (P3) |
| /admin/meet | redirect to booking-page | Stub (in-page redirect) | none | — | remove after Settings seat |
| /admin/queue | old action queue | D | P (2 V1) | — | remove (308 to Today) |
| /admin/briefing | old briefing | D | Q, Hw, P (8) | modules.ops | remove page. Fix links |
| /admin/briefing/weekly | weekly briefing | R | none (only from dead briefing) | modules.ops | needs a home: Plan & Close Friday (P2) |
| /admin/calendar | old calendar | Stub (WeekSection reused) | P (4) | — | remove page |
| /admin/work/plan-close | Monday plan + Friday close | R | N Work>Plan & Close | modules.ops | keep |
| /admin/work/my-week | week grid | R | N Work>My Week | modules.meetings | keep |
| /admin/ops/my-week | old My Week | D | P (5) | modules.ops | remove |
| /admin/work/tasks | tasks | H→ops | N Work>Tasks | modules.ops | keep |
| /admin/ops | tasks source | S | P (10), Q | modules.ops | fold into host (P3) |
| /admin/ops/monday | old Monday plan | Stub | Q | modules.ops | remove page |
| /admin/ops/friday | old Friday close | Stub | Q | modules.ops | remove page |
| /admin/work/projects | projects | H→ops/projects | N Work>Projects | modules.ops | keep |
| /admin/ops/projects | projects source | S | P (21) | modules.ops | fold (P3) |
| /admin/work/projects/[id] | project detail | H | P | modules.ops | keep |
| /admin/ops/projects/[id] | project detail source | S | P | modules.ops | fold (P3) |
| /admin/work/meetings | meetings + connections | H (wrapper) | N Work>Meetings | modules.meetings | keep |
| /admin/meetings | meetings source | S | P (7), Q | modules.meetings | fold (P3) |
| /admin/meetings/connections | old connections | Stub | Q | modules.meetings | remove page |
| /admin/meetings/booking-page | public scheduler settings | R | Q only | modules.meetings | fold into Settings (P1) |
| /admin/work/meetings/[id] | meeting detail | H | P | modules.meetings | keep |
| /admin/meetings/[id] | detail source | S | P | modules.meetings | fold (P3) |
| /admin/work/meetings/upcoming/[eventId] | upcoming event prep | H | P | modules.meetings | keep |
| /admin/meetings/upcoming/[eventId] | source | S | P | modules.meetings | fold (P3) |
| /admin/work/documents | documents | H | N Work>Documents | modules.documents | keep |
| /admin/documents | source | S | P (7) | modules.documents | fold (P3) |
| /admin/programs/overview | program dashboard | R | N Programs>Overview | modules.program | keep |
| /admin/program | 9-line placeholder | D | P (1) | — | remove |
| /admin/programs/people | roster | H→students | N Programs>People | modules.program | keep |
| /admin/students | source | S | P (6), Q, Hw | modules.program | fold (P3) |
| /admin/programs/people/[id] | participant detail | H | P | modules.program | keep |
| /admin/students/[id] | source | S | P | modules.program | fold (P3) |
| /admin/programs/intake | applications | H | N Programs>Intake | modules.program | keep |
| /admin/intake | source | S | P, Q | modules.program | fold (P3) |
| /admin/programs/cohorts | cohorts | H | N Programs>Cohorts | modules.program | keep |
| /admin/cohorts | source | S | P (13), Q | modules.program | fold (P3) |
| /admin/programs/cohorts/[id] | cohort detail | H | P | modules.program | keep |
| /admin/cohorts/[id] | source | S | P | modules.program | fold (P3) |
| /admin/programs/cohorts/[id]/sessions/[sessionId] | attendance session | H | P | modules.program | keep |
| /admin/cohorts/[id]/sessions/[sessionId] | source | S | P | modules.program | fold (P3) |
| /admin/programs/attendance | cross-cohort sessions | R | N Programs>Attendance | modules.program | keep |
| /admin/programs/partners | partners board | H | N Programs>Partners | modules.partners | keep |
| /admin/partners | source | S | P (16), Q | modules.partners | fold (P3) |
| /admin/programs/partners/[id] | partner detail | H | P | modules.partners | keep |
| /admin/partners/[id] | source | S | P | modules.partners | fold (P3) |
| /admin/programs/content | career library | H→careers | N Programs>Content | modules.content | keep |
| /admin/careers | source | S | P | modules.content | fold (P3) |
| /admin/careers/daily | daily game calendar | R | P (Content) | modules.content | keep. Make it a section tab of Content (P3) |
| /admin/careers/pool | game pool review | R | P (Content) | modules.content | same |
| /admin/programs/coach | Ambition Coach | R | N Programs>Coach | aa.coach | keep |
| /admin/fundraising | old pipeline home | Stub | P (20) | modules.fundraising | remove page |
| /admin/fundraising/today | Today's Moves | R | N Fundraising>Today | modules.fundraising | keep. Align the tab label with the title (P2) |
| /admin/fundraising/donors-funders | constituent list | R | N Fundraising>Donors & Funders | modules.fundraising | keep. Its pattern is the list standard |
| /admin/fundraising/donors-funders/[id] | Donor 360 | R | P | modules.fundraising | keep. Fix "Donors" h1 (P2) |
| /admin/fundraising/donors-funders/companies | companies view | R | P (D&F) | modules.fundraising | keep |
| /admin/fundraising/donors | old donor list + DataTable | D, 595 lines | P (38 V1 links) | modules.fundraising | remove (P2) |
| /admin/fundraising/donors/[id] | Donor 360 source | Stub | P | modules.fundraising | remove page |
| /admin/fundraising/prospects | prospect bench | Stub | Q | ai.prospect_research | remove page (bench lives in drawer) |
| /admin/fundraising/prospects/[id] | prospect profile | Stub | P | ai.prospect_research | remove page |
| /admin/fundraising/prospects/import | HubSpot import picker | R | P (drawer) | ai.prospect_research | keep (Data sources later) |
| /admin/fundraising/prospects/by-hubspot/[hubspot_id] | resolver to profile | R | P (pipeline board) | ai.prospect_research | keep |
| /admin/fundraising/pipeline | opportunities + ask log | R | N Fundraising>Pipeline | modules.fundraising | keep |
| /admin/fundraising/pipeline/[id] | ask detail | R | P | modules.fundraising | keep. Fix "Ask Log" h1 (P2) |
| /admin/fundraising/asks | old ask log | Stub | P, Q | modules.fundraising | remove page |
| /admin/fundraising/asks/[id] | old ask detail | Stub | P | modules.fundraising | remove page |
| /admin/fundraising/grants | grants board/list | R | N Fundraising>Grants | modules.fundraising | keep |
| /admin/fundraising/grants/[id] | grant detail | R | P | modules.fundraising | keep. Fix "Grants" h1 (P2) |
| /admin/fundraising/campaigns | campaign attribution + gift tables | R | N Fundraising>Campaigns | modules.fundraising | keep. Rename to avoid clash with Comms (P1) |
| /admin/fundraising/campaigns/gift-tables/[id] | gift table detail | R | P | modules.fundraising | keep (best ui-kit adopter) |
| /admin/fundraising/plan | old plan list | D, 367 lines | P (5 V1) | modules.fundraising | remove |
| /admin/fundraising/plan/[id] | plan detail | R, 309 lines | none (only from dead plan page) | modules.fundraising | needs a home (Campaigns) or remove (P2) |
| /admin/fundraising/comms | email sends | R | N Fundraising>Comms | modules.comms | keep. Move to Comms destination |
| /admin/fundraising/comms/[id] | send detail | R | P | modules.comms | keep |
| /admin/fundraising/acknowledgments | old ack queue | Stub (AckQueue reused) | P (7) | modules.fundraising | remove page |
| /admin/fundraising/acknowledgments/letters | printable letters | R | P (AckQueue) | modules.fundraising | move to Comms |
| /admin/fundraising/acknowledgments/templates | ack templates | R | P (AckQueue) | modules.fundraising | Comms or Settings |
| /admin/fundraising/recurring | old recurring | D | none | modules.fundraising | remove (now a D&F view) |
| /admin/fundraising/journeys | old journeys | D | P (dead pages) | modules.fundraising | remove. Journeys need a Comms seat (P2) |
| /admin/fundraising/volunteers | old volunteers | D | P (1) | modules.fundraising | remove |
| /admin/fundraising/pledges | old pledges | Stub (section reused in Forecast) | P | modules.fundraising | remove page |
| /admin/fundraising/pledges/[id] | pledge detail | R | P (CompanyPanel, Today queue) | modules.fundraising | keep. Fix back-link label |
| /admin/fundraising/reports | gift reports + segments | R | none (dead donors page only) | modules.fundraising | needs a home: Finance Reports or D&F export (P2) |
| /admin/fundraising/strategy | funder-angle briefs | R | P (drawer), Q | modules.fundraising | needs a home. Rename (clashes with Org Strategy) (P2) |
| /admin/fundraising/strategy/[key] | angle detail | R | P | modules.fundraising | keep with parent |
| /admin/fundraising/settings | fundraising settings | R | none live | modules.fundraising | fold into Settings (P1) |
| /admin/fundraising/settings/stages | pipeline stages | R | P (Pipeline) | modules.fundraising | fold into Settings |
| /admin/fundraising/import | donor CSV wizard | R | P (D&F, fund settings) | modules.fundraising | merge into /admin/imports (P1) |
| /admin/fundraising/duplicates | dedupe review | R | P (fund settings only) | modules.fundraising | Settings > Data (P2) |
| /admin/finance/snapshot | finance dashboard | H→finance | N Finance>Snapshot | modules.finance | keep |
| /admin/finance | source, 883 lines | S | P (15), Q | modules.finance | fold (P3) |
| /admin/finance/transactions | ledger + reconcile + close | R | N Finance>Transactions | modules.finance | keep |
| /admin/finance/reconcile | old | Stub | P | modules.finance | remove page |
| /admin/finance/close | old | Stub | P | modules.finance | remove page |
| /admin/finance/budget | budget vs actual | R | N Finance>Budget | modules.finance | keep |
| /admin/finance/budget/import | budget import | R | P (budget, upload) | modules.finance | keep. Data sources (P3) |
| /admin/finance/forecast | forecast + pledges | R | N Finance>Forecast | modules.finance | keep |
| /admin/finance/model | old model | Stub | P | aa.finance_model | remove page |
| /admin/finance/revenue | old revenue | Stub | P (9), Q | modules.finance | remove page |
| /admin/finance/reports | report builder | R | N Finance>Reports | modules.finance | keep. Fix subtitle jargon (P1) |
| /admin/finance/report | old board report | Stub | P | modules.finance | remove page |
| /admin/finance/rules | categorization rules | R | none | modules.finance | fold into Settings (P1, orphan) |
| /admin/finance/config | finance config | R | P (close wizard) | modules.finance | fold into Settings |
| /admin/finance/upload | bank CSV upload | R | P (transactions) | modules.finance | keep. Data sources (P3) |
| /admin/impact/outcomes | outcomes | R | N Impact>Outcomes | modules.metrics | keep |
| /admin/impact/kpis | KPIs + scorecard | H (wrapper) | N Impact>KPIs | modules.metrics | keep |
| /admin/kpis | source | S | P | modules.metrics | fold (P3) |
| /admin/impact/analytics | website analytics | H | N Impact>Analytics | aa.site_analytics | keep. Label "Website" (P3) |
| /admin/analytics | source (custom sticky header) | S | P, Q | aa.site_analytics | fold (P3) |
| /admin/impact/reports | report builder | R | N Impact>Reports | modules.metrics | keep. Fix subtitle (P1) |
| /admin/organization/strategy | strategic plan | H | N Org>Strategy | modules.strategy | keep |
| /admin/strategic-plan | source | S | P (22), Q | modules.strategy | fold (P3) |
| /admin/organization/strategy/objective/[id] | objective detail | H | P | modules.strategy | keep |
| /admin/strategic-plan/objective/[id] | source | S | P | modules.strategy | fold (P3) |
| /admin/organization/strategy/review | monthly review | H | P | modules.strategy | keep |
| /admin/strategic-plan/review | source | S | P | modules.strategy | fold (P3) |
| /admin/strategic-plan/scorecard | old scorecard | Stub | P | modules.strategy | remove page |
| /admin/strategic-plan/narrative | presenter deck | R | P (plan page) | modules.strategy | keep (child of Strategy) |
| /admin/strategic-plan/people | plan owners | R | P (plan page) | modules.strategy | keep (child of Strategy) |
| /admin/strategic-plan/setup | plan setup wizard | R | P (plan page) | modules.strategy | keep. Settings later (P3) |
| /admin/organization/team | org chart | H→staff | N Org>Team | modules.staff | keep |
| /admin/staff | source | S | P | modules.staff | fold (P3) |
| /admin/organization/team/[id] | staff detail | H | P | modules.staff | keep |
| /admin/staff/[id] | source | S | P | modules.staff | fold (P3) |
| /admin/staff/reviews | 360 review cycles | R | P (Team header) | modules.staff | keep. Fix permission state (P2) |
| /admin/staff/reviews/[cycleId] | cycle detail | R | P | modules.staff | keep |
| /admin/organization/board | board members | H | N Org>Board | modules.board | keep |
| /admin/board | source | S | P, Q | modules.board | fold (P3) |
| /admin/organization/board/[id] | member detail | H | P | modules.board | keep |
| /admin/board/[id] | source | S | P | modules.board | fold (P3) |
| /admin/organization/compliance | compliance items | H | N Org>Compliance | modules.compliance | keep |
| /admin/compliance | source | S | P, Q | modules.compliance | fold (P3) |
| /admin/organization/compliance/[id] | item detail | H | P | modules.compliance | keep |
| /admin/compliance/[id] | source | S | P | modules.compliance | fold (P3) |

Totals: 149 page files. 28 one-line re-export hosts plus 2 thin wrapper hosts (work/meetings, impact/kpis). About 35 S sources reached only through hosts. 27 Stub/D files at 308'd URLs, plus the `/admin/meet` redirect. 5 live screens with no live link (`finance/rules`, `fundraising/settings`, `fundraising/plan/[id]`, `briefing/weekly`, `fundraising/reports`), plus `legacy`. 1 dead chrome link (`/admin/v2`).
