# BloomOS V4: product readiness spec

**Status:** draft for Remi's approval, 2026-11-20. No build starts until he says yes.
**Inputs:** the brief (`specs/bloomos-v4-product-readiness-brief.md`), the Phase 0 audit (`specs/v4-phase0/`), the Phase 1 interview (`specs/v4-phase1-interview.md`).
**Prototypes:** https://claude.ai/artifact/KVnhtyF2KqCJKkAYG3eYMb (the canvas named "BloomOS V4 list and board standard"; every screen named below is an artboard there).

## 1. What V4 is

BloomOS does not need a redesign. It needs to use its own kit everywhere, put the person's next step first on every screen, and be safe for a second organization. V4 is done when someone who learns one part of BloomOS finds the rest familiar, and a pilot org's ED and one or two staff can run their fundraising in it after we set them up.

## 2. Design principles

1. **Next step first.** Every screen, row and record leads with what to do next, and lets you do it there.
2. **One way to do each thing.** One page frame, one list, one detail page, one drawer, one table, one button. No local variants.
3. **Numbers you can trust.** Every figure says where it came from and how fresh it is. Missing is never shown as zero.
4. **Quiet until needed.** Show the main thing; tuck the rest one click away. Accent color only on the one primary action, the current place, and active filters.
5. **Say it or tap it.** Anything worth logging can be spoken and confirmed on cards, from any screen, on any device.

## 3. Who it is for

| Person | Real role today | Top jobs |
|---|---|---|
| Executive director | `owner` | See what is mine and overdue, check the money, know my day, log by voice |
| Ops and finance lead | `admin` or `finance` | Keep tasks moving, categorize and reconcile, enter gifts and send thank-yous |
| Development staff | `staff` | Work my donors, record gifts, send thank-yous, move asks |
| Program staff | `staff` | Rosters, attendance from a phone, notes, stories |
| Board member | `board_viewer` | Read-only view of finance and progress |

No new roles. Development and program staff are both `staff`; what differs is what is **assigned to them**. V4 adds an owner to donors, asks, cohorts and programs (tasks already have one) and builds "mine" from assignment. Permissions stay as they are and are enforced on the server (hardening item 3).

## 4. Navigation

Eight destinations, one tab row each, plus Inbox and Settings.

| Destination | Tabs |
|---|---|
| Home | Today, Organization Health |
| Work | Plan & Close, My Week, Tasks, Projects, Meetings, Documents |
| Programs | Overview, People, Intake, Cohorts, Attendance, Partners, Coach |
| Fundraising | Today, Donors & Funders, Pipeline, Grants, Campaigns, Thank-yous |
| **Comms** (new) | Home, Stories, Editions, Emails, Automations, Settings |
| Finance | Snapshot, Transactions, Budget, Forecast, Reports |
| Impact | Outcomes, KPIs, Analytics, Reports |
| Organization | Strategy, Team, Board, Compliance |

Moves and removals:

- **Comms** leaves Fundraising and becomes a destination. Email campaigns are called "Emails" so "campaign" means only a fundraising campaign. Journeys move in as "Automations". Thank-you templates are edited under Comms Settings; the thank-you queue stays in Fundraising as "Thank-yous" because it is daily donor work.
- **Settings** becomes a real home with sections: Organization, People and roles, Terms, Modules, Connections (Gmail, Calendar, HubSpot), Fundraising, Finance (rules, categories, upload config), Imports, Help. The roughly 12 scattered setup screens move here.
- **Inbox** keeps notifications; its "Messages" tab is renamed "Team chat" so it is not confused with Comms.
- **Orphans get homes:** weekly briefing folds into Today; fundraising reports and strategy become links from Fundraising Today; staff reviews move under Organization, Team; careers daily and pool stay under Programs, Content for Ambition Angels only.
- **Removed (needs Remi's yes):** about 2,700 lines of dead screens behind redirects, the `overview/` widgets, `CommandCenter`, the `/admin/legacy` page, the dead "V2" sidebar link, and the older fundraising import wizard once gift import moves into `/admin/imports`. No capability is lost.
- How-To and global search are rewritten from the nav model so they match what each org can see.

## 5. Page anatomy

One frame for every page: flush dark sidebar; a bright working panel with rounded corners; one tab row; then the page.

| Archetype | Anatomy | Prototype |
|---|---|---|
| **List** | Header (title, one primary action, More actions). Saved views as tabs, "mine" first. One filter row (search, Filters count, Sort, three or four quick filters, Clear all, Advanced). Summary strip. Table with a next-step column. Footer with count and bulk actions. Phone: cards. | Main, Roster, SetupEmpty |
| **Board** | Same header, views and filter row. Columns with count and total. Cards: title, two or three fields, one urgency signal, owner. | Pipeline |
| **Detail** | Breadcrumb. Header with identity chips and one primary action. A next-step bar. Summary strip. One timeline on the left; compact context panels on the right. | Donor, DonorPhone |
| **Dashboard** | Header. A decision line in plain words. Summary strip. At most one chart. A "Needs you" list. One compact table. | Today, Finance, Comms |
| **Form** | A drawer over the page for anything under about ten fields; a full page only for multi-step work. Required fields first and few; smart defaults; one primary button that completes the whole job. | GiftFlow |
| **Settings** | Left list of sections, one section per page, save per section. | (built in Stage A) |

Widths: one workspace width (1280) for lists, boards and dashboards; one reading width (900) for forms and settings. The other five widths go.

## 6. Component standards

Extend `app/admin/_components/ui/`. No parallel kit.

- **Button:** primary, secondary, quiet, danger; two sizes. Replaces 269 hand-built primary buttons.
- **Field:** input, select, textarea, date, each with a label and error line. Replaces 440 raw inputs.
- **Drawer and Modal:** one of each, with focus trap, Escape, and a phone sheet form. Replaces 27 hand-built overlays.
- **DataTable v2:** rebuilt on the Donors & Funders pattern: filters in the URL, saved views on the server, server-side paging and sort, a phone card layout, bulk selection. Replaces 22 hand-built tables.
- **PageHeader, FilterRow, SavedViews, SummaryStrip, NextStepBar, Timeline, EmptyState, Notice:** new or extended, one each.
- **Figure:** every displayed number goes through `Metric`, which carries source and freshness. `StatCard` becomes a wrapper around it.
- **States:** skeleton for loading; EmptyState with one action for empty; Notice for partial or stale data; error boundary for failed reads; toast for success and failed saves. A failed save always rolls back and says so.

Lint rules ban raw `<table>`, hand-built overlays and unlabeled inputs under `app/admin` once each stage has migrated its screens, so the count only goes down.

## 7. Today

For an owner: **mine and overdue**, **money at a glance**, and a thin **my day** strip. Below: donors who need me, team this week. Other roles see the same frame with different panels: finance sees uncategorized transactions and bills due; staff see their donors or their cohorts; a board viewer sees a read-only summary. Panels are chosen by permission and filled by assignment. The page's primary action is **Talk to log**.

## 8. Voice capture

A front door, not a module. One button in the shell on desktop and the center of the phone bar. Speak, then confirm cards: a donor conversation, a to-do, a gift or pledge, a story. Each card shows where it will be filed, marks AI-drafted and uncertain fields, and nothing is saved until confirmed. Stories about an identifiable participant are held until consent is on file. Turned on for every org by default; usage limits per org; transcripts follow the redaction boundary before any AI call.

## 9. Workflows to fix, with targets

Baselines are from the audit. Targets are what the build must demonstrate.

| Workflow | Today | Target |
|---|---|---|
| Record a gift and thank the donor | about 9 clicks, 3 screens, cannot edit a gift | 1 drawer, 3 clicks or fewer after opening it, gifts editable |
| Find a donor and log the next step | several screens | search, record, next-step bar: 3 clicks |
| Take attendance on a phone | 4 to 5 taps to the roster, 4 taps to mark absent | 2 taps to the roster, 1 tap per exception, works offline and says so |
| Enroll a roster in a cohort | about 60 clicks for 30 people | multi-select or import with a cohort column: under 10 clicks |
| Complete a task | fails silently on error | one tap, rolls back and says so on failure |
| Story to email to donor record | leaves Comms, nothing reaches the donor | one flow inside Comms; sends and opens appear on the donor timeline |

## 10. Phone

Four jobs get phone-specific screens: talk to log, look someone up, check Today, take attendance. Everything else must work at 390px (no tab wider than the screen, tables as cards, 44px targets) but is not redesigned. The app never stores authenticated pages on the device and always shows when it is offline (hardening item B).

## 11. Onboarding: pilot-ready

We set it up, they finish.

- **Operator:** one script from an answers file creates the org, entitlements, the owner's access, terms, stages, starter finance categories, a thank-you template and a pipeline. Target: 2 operator actions per org, down from 10.
- **In the app:** a five-step checklist on Home: confirm your organization (legal name, address, EIN), invite a teammate, connect Gmail, bring in your donors, record a first gift or talk to log. Prototype: Setup.
- **New screens:** People and roles (invite, change role, remove), Organization identity, Terms, Connections.
- **Imports:** one wizard with column mapping, validation, duplicate check, preview and undo.
- **Support:** a support address and a "report a problem" action replace "tell Remi".
- **Not in V4:** self-service signup and billing.

## 12. Technical plan

- **Keep the architecture.** Server components read through loaders; writes go through `/api/admin`. No server actions, no client cache library. Add one `saveAction` helper that checks the response, rolls back optimistic changes, and toasts with `userMessage()`. Optimistic updates only where rollback is safe; never on money.
- **Assignment:** add `owner_id` to constituents, asks, cohorts and programs, with a default and a bulk-assign action. One migration, approved before it is applied.
- **Lists:** server-side paging, sort and filter for donors, gifts, tasks, transactions and participants. Speed up `v_fr_rollups` (it averages 2 seconds and has timed out).
- **Authorization:** one server guard that checks role as well as org on every write route and service-role page; explicit active-org filters on the remaining session routes; the anon-grant gap closed in the test database so CI catches it.
- **Observability:** error reporting on server and client, with org and route but no personal data; a failed-save and failed-cron log visible to operators; schedule or delete the six unscheduled jobs.
- **Privacy-conscious analytics:** count task completion for the Section 9 workflows, time to first value in setup, and errors, by org, with no record contents.
- **Tests:** the harness in `e2e/v4/` becomes the visual regression run (desktop and phone, four roles, empty and populated). Add end-to-end smoke flows for the six workflows in Section 9, run as two orgs and three roles. Token, type, nav and copy tests stay and are updated on purpose.
- **Accessibility:** WCAG 2.2 AA on every migrated screen: labels on all controls, visible focus, keyboard access to boards and menus, status never by color alone.
- **Backups:** fix the nightly off-site backup and test one restore before any pilot org has data.

## 13. Build order

Each stage ends with gates green, before and after screenshots on desktop and phone, the SafeSpace no-regression check, a short change note, a commit, and a stop for Remi.

| Stage | What | Done when |
|---|---|---|
| **H. Hardening** (in progress) | The pre-SafeSpace list: `specs/v4-phase0/pre-safespace-hardening.md` | No open P0. Roles enforced on the server. Backup restored once. |
| **A. Foundations** | Page frame, kit, states, DataTable v2, Figure, `saveAction`, Settings home, People and roles, nav changes, dead code removed, lint rules | Every archetype exists as a working page. Kit adoption counted and published. |
| **B. Fundraising** | Donors & Funders, donor record, gift and thank-you drawer, Pipeline, Thank-yous, assignment | Section 9 targets for gifts and donors met. |
| **C. Today and voice** | Today by role, Talk to log everywhere, four card kinds, phone Today and lookup | An ED can run a day from Today. Voice files all four kinds. |
| **D. Comms** | Destination, story bank landed on the Gmail sender, segment builder with live count, results on donor timelines | Story to send to donor record is one flow. Consent enforced. |
| **E. Programs** | Roster, cohorts, bulk enroll, phone attendance with offline, Ambition Coach fit | Section 9 targets for attendance and enrollment met. |
| **F. Onboarding** | Setup script, checklist, import wizard, support path | A throwaway org is set up end to end in under 30 minutes of operator time. |
| **G. The rest** | Work, Finance, Impact, Organization moved onto the standard | No screen outside the standard. Lint rules at zero exceptions. |
| **P. Pilot hardening** | Roles, two-org, phone, accessibility and end-to-end passes; scorecard | Scorecard below is met. |

## 14. Pilot-ready scorecard

- **Usability:** each Section 9 target demonstrated. Three people who have never used BloomOS complete record-a-gift, find-a-donor and take-attendance without help, at least 2 of 3 on each.
- **Onboarding:** a new org is created with 2 operator actions; its ED finishes the checklist in one sitting; first gift recorded in the first session.
- **Trust:** zero open P0 or P1 in pilot scope; cross-org and role tests pass in CI; one restore tested; a failed save is always visible.
- **Quality:** smoke flows pass for two orgs and three roles on desktop and phone; visual run has no unexplained diffs.
- **Learning:** we can see, per org, which Section 9 workflows were completed, where setup stalled, and the errors people hit.

## 15. Decisions needed from Remi

1. Approve the navigation in Section 4, including Comms as the eighth destination and the removals listed there.
2. Approve the build order in Section 13: Fundraising, then Today and voice, then Comms, then Programs.
3. Approve adding an owner to donors, asks, cohorts and programs (a database change, applied with his yes).
4. Approve the prototypes as the standard, or mark what to change.
5. Decide who answers the five outside-user questions in the interview summary, and when SafeSpace can be asked.
