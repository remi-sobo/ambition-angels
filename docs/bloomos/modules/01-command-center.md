# Module 01 — Command Center

**Sidebar:** Overview · Inbox · Messages · Strategy · Executive Briefing
**Job:** the CEO opens BloomOS and knows, in 30 seconds, what's happening across the mission and what needs them today.

## Inbox vs Messages (intentionally two sections)

- **Inbox (`/admin/inbox`)** — the per-user **notification feed**: alerts,
  mentions, task assignments, and system events from anywhere in BloomOS
  (`notifications` table, `notifications_spine.sql`). Read-once rows with an
  optional click-through link.
- **Messages (`/admin/messages`)** — the **team chat** itself: DMs and group
  conversations between org members (see `docs/bloomos/messaging-spec.md`).

They overlap on purpose: when someone sends you a chat message, `postMessage`
also drops **one** unread `message.received` pointer into your Inbox per
conversation ("so nothing gets missed"), linking to the thread. Opening the
thread clears both the chat unread and the Inbox pointer. So a new message
showing up in both places is the designed behavior, not a duplicate feature —
each page carries a plain-language subtitle stating its role.

## Overview (dashboard)

### Role views — CEO cockpit + Ops control panel (shipped)

The Overview is no longer one kitchen-sink dashboard. It's **two curated views**,
each built around the questions that role actually has to answer, with a pill to
toggle between them. The view **defaults to the logged-in person's own view**
(CEO cockpit for Remi, Ops control panel for Shannon — resolved from the
membership via `getAdminUser()`); the pill peeks at the other. The manual
override is persisted per-device in `localStorage` (`bloomos.overview.view`).

Code lives in `app/admin/_components/overview/` (`RoleViewShell`, `CeoCockpit`,
`OpsPanel`, and one component per widget); data loaders are in
`lib/admin/overview/sources.ts`, one cached loader per source so rendering both
views for the toggle never double-queries a shared source. **A view is an
ordered arrangement of widget keys** — widgets are self-contained components, not
a monolith — so a future configurable widget board is cheap.

Above both views, **"Needs you today"** (`BriefingStrip`) renders the briefing
engine's top items as full, **actionable** cards (`BriefingCard`): the why-line
plus **Open / Done / Snooze / Dismiss** with optimistic Undo, writing to
`bloomos_briefing_state` via `/api/admin/briefing/decision`. Not just links.

**CEO cockpit (Remi)** — where do we stand on money, what's my day, who do I
chase. Curated to Remi's brief (no "fires", no mission widget):
- **Finance snapshot:** runway leads (cash ÷ trailing-3-month burn; amber < 3,
  critical < 1.5), with cash on hand, monthly burn, and net-YTD beneath. The
  full cash-flow chart stays on the Finance page.
- **Fundraising snapshot (Goal & forecast):** raised vs FY goal; forecast =
  committed (gifts + stewardship asks) + weighted open (Σ `ask_amount ×
  (probability ?? 50%)` over identify/qualify/cultivate/solicit). Closed-lost
  excluded — **never total pipeline.** _(A goal/fundraising KPI is noted for the
  KPI pass.)_
- **Schedule:** upcoming meetings from the connected Google Calendar (see below).
- **My to-dos:** Remi's open tasks (`assigned_to = remi`).
- **Partners to follow up:** open asks where `owner = remi OR ask_amount ≥ $10k`
  AND next step is missing or overdue, biggest first.

**Ops control panel (Shannon)** — her work, her calendar, the money picture, what
to chase. Starting set per Shannon's brief (she tunes from here):
- **My tasks** (her open tasks), **Schedule** (her calendar), **Meetings to
  schedule** (`/meet` bookings), **Financial overview** (the same finance
  snapshot), **Fundraising to-dos & grants** (grant requirements + overdue pledge
  installments), **Funders to follow up** (the moves list), **Acknowledgments
  due** (oldest first, gifts ≥ $250 IRS-flagged).
- Shannon can **reorder and hide cards within her own view** (`OpsBoard`, "Edit
  layout" mode), persisted per-device (`bloomos.overview.ops.layout`) and
  reconciled against the current widget set on load. The CEO view is unaffected.
- Data-hygiene/duplicates widgets exist (`DataHygieneWidget`) but are off her
  default set — hygiene was de-prioritised; re-add via the board when wanted.

**Schedule / Google Calendar:** the `/meet` scheduler already authenticates a
Google Calendar client (`lib/google/calendar.ts`, OAuth refresh token, host
`GOOGLE_CALENDAR_ID`). The Schedule widget adds `listUpcomingEvents()` and reads
the next two weeks — and because `/meet` writes bookings to that same calendar,
this is the unified schedule. It degrades to the bookings table if Calendar
isn't configured. **Caveat:** it's one shared host calendar today; per-person
calendars (Remi's vs Shannon's own) would need per-user Google OAuth — not yet
built.

**Data/RLS note:** fundraising-spine reads (opportunities, gifts,
grant_requirements, pledge_payments, interactions) run under the user-session
client (RLS, org-scoped). Finance, ops/bookings, and calendar reads keep the
service-role / host-account path those modules still use; flip them when each
module's conversion lands.

> The two views above are the curated v1. The broader vision below — a
> metric-registry-driven, fully configurable widget board — is the multi-tenant
> direction these arrangements build toward, not yet implemented.

Full widget inventory and layout in 06-design-system §5. Functional requirements:

1. **All widgets are metric-registry renderers** — no widget queries tables directly. Adding a metric to the registry makes it available to dashboards, reports, and the AI agent simultaneously.
2. **Period controls**: This Month / Quarter / Fiscal Year / custom; deltas computed vs prior period from `kpi_snapshots` (nightly materialization).
3. **Organizational Health Score (n/100)** — composite with transparent breakdown on click. Initial formula (weights configurable per org):
   - Financial (35%): months of cash vs 3-month floor; budget variance; revenue concentration.
   - Fundraising (25%): pipeline coverage vs goal gap; donor retention vs FEP ~43% benchmark.
   - Program (25%): enrollment vs capacity; attendance rate; journey-stage conversion.
   - Operations/Governance (15%): overdue tasks/compliance items; board participation.
   Never a black box: every component shows its inputs and how to improve it.
4. **Upcoming Priorities** is cross-module: grant deadlines (`grant_requirements`), compliance due dates, board meetings, project milestones, MOU/clearance expiries — ranked by date + severity, each deep-linking to its module.
5. **Recent Wins** auto-detects from the event stream (gift ≥ threshold, grant stage→awarded, school agreement signed, milestone counts) and allows manual pinning — feeds board packets and newsletters.
6. Per-user layout overrides (drag/hide) on the org default; "reset to default." _Shipped (light) for the Ops control panel — reorder/hide + reset via `OpsBoard`; the full drag-and-drop board across both views is still ahead._

## Executive Briefing (the flagship AI feature)

A generated narrative briefing — the "chief of staff" output. Modes:

- **Daily (lightweight):** what changed since yesterday, today's calendar/tasks, anything red.
- **Weekly (Monday)**: the operating brief — last week's wins/misses, this week's Big-3 recommendation (feeds Ops Monday Plan), pipeline movement, cash position, flags.
- **Monthly/Board (on demand):** board-packet-grade summary (feeds Governance module's packet generator).

**Generation pipeline:** Inngest scheduled job → gather structured inputs *only from the metric registry + event stream* (numbers are computed by SQL, never by the model) → Sonnet 4.6 with structured output → sections: headline, wins, risks, decisions-needed, recommended priorities → stored draft → delivered in-app + email digest (Resend). Each claim carries source links ("3 donors lapsed → view list"). Schema: `briefings(org_id, kind, period, content jsonb, status)`.

**Interactivity:** the briefing panel hosts the org-data chat agent ("why did expenses spike?") — agent answers via metric registry + RAG over notes/docs, RLS-scoped, read-only (no `pending_actions` from this surface in v1).

## KPIs for this module itself
- Daily active use by org leaders; briefing open rate; % of briefing-recommended priorities accepted into Monday Plan.

## Dependencies / sequencing
- Needs: metric registry (Ring 1), kpi_snapshots, at least Finance + Ops data flowing. Ships a useful v1 with finance + tasks only; widgets light up as modules land (empty-state explains what will appear).

## Open questions
- Org Health weights: validate against what Remi actually watches for 2–3 months before locking defaults.
- Briefing email cadence default (daily digest vs weekly only) — test on ourselves.
