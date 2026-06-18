# Module 01 — Command Center

**Sidebar:** Overview · Executive Briefing
**Job:** the CEO opens BloomOS and knows, in 30 seconds, what's happening across the mission and what needs them today.

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

**CEO cockpit (Remi)** — are we surviving, is the money coming, what must I do,
is the mission working, what's on fire:
- **Runway & cash (hero):** cash on hand, burn = trailing-3-month average
  expense, months = cash / burn, ending-balance trend. Amber < 3 months,
  critical < 1.5.
- **Goal & forecast:** raised vs FY goal; forecast = committed (gifts +
  stewardship asks) + weighted open (Σ `ask_amount × (probability ?? 50%)` over
  identify/qualify/cultivate/solicit). Closed-lost excluded — **never total
  pipeline.**
- **Moves only you can make:** open asks where `owner = remi OR ask_amount ≥
  $10k` AND next step is missing or overdue, biggest ask first.
- **Mission proof:** hero = Future-Orientation lift, secondary =
  second-internship completion. Program/impact data **is not queryable in
  BloomOS** (see 05-data-impact), so these are honest, dated, **manually-entered**
  figures (`lib/admin/overview/mission.ts`), clearly labelled — never a
  fabricated computed number. Replace with a loader when a real pipeline lands.
- **Fires:** major prospect cold 60+ days, grant requirement due ≤ 14 days,
  runway < 2 months, top ask with an overdue next step — each deep-linked.
  Hygiene/data items deliberately do **not** live here (those are Shannon's).

**Ops control panel (Shannon)** — what's on my plate, who needs a thank-you,
what to schedule, is the data clean, what's due, what to chase:
- My queue (her tasks), acknowledgments due (oldest first, gifts ≥ $250
  IRS-flagged), scheduling lane (upcoming bookings), **data hygiene** (sync
  freshness — the stale-data alert lives here as actionable work, not a CEO
  fire — plus duplicates and unattributed gifts), deadlines + finance ops (grant
  requirements + overdue pledge installments), and fundraising follow-through.
- Shannon can **reorder and hide cards within her own view** (`OpsBoard`, "Edit
  layout" mode), persisted per-device (`bloomos.overview.ops.layout`) and
  reconciled against the current widget set on load. The CEO view is unaffected.

**Data/RLS note:** fundraising-spine reads (opportunities, gifts,
grant_requirements, pledge_payments, interactions) run under the user-session
client (RLS, org-scoped). Finance and ops/bookings reads keep the service-role
path those modules still use; flip them when each module's RLS conversion lands.

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
