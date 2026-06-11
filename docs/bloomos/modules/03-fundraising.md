# Module 03 — Fundraising

**Sidebar:** Donors · Major Gifts · Grants · Campaigns · Events
**Job:** the full development office: donor CRM, moves management, grants pipeline, campaign attribution — replacing HubSpot, beating Bloomerang-class tools on intelligence, with Givebutter as the payments front-end. The most important module commercially.

Data model: 05 §3. Strategy: *LGL price + Bloomerang retention intelligence + Virtuous next-actions + native grants (the universal gap).*

## Donors

1. **Constituent profiles**: people + orgs, households (auto soft-credit household members), relationships ("who knows this funder" — board connections surfaced on every profile), giving history timeline, engagement score (recency/frequency/monetary + event/email/volunteer touches), communication log, tags/segments, do-not-contact.
2. **Gift ingestion**: Givebutter webhooks (`transaction.succeeded`, `contact.created`, plans, pledges, refunds) → upsert constituents (email/phone match) + create gifts with campaign/fund attribution; nightly reconciliation (webhooks don't fire for CSV imports); Stripe donations (existing flow) merge in; manual gift entry (cash/check/in-kind/stock) with batch mode. **Dedupe/merge review queue** is a first-class screen.
3. **Hard/soft credit correctness** (corrupts receipts if wrong): DAF and matching-gift checks → hard credit to institution, soft credit to advisor/employee. Tribute gifts with honoree notification tracking.
4. **Acknowledgments & receipts (IRS Pub 1771 compliance as a feature)**: per-gift acknowledgment queue; templates auto-inserting compliant language (≥$250 contemporaneous written acknowledgment with no-goods-or-services statement; >$75 quid-pro-quo disclosure with FMV/deductible split from gift fields); year-end consolidated statements (January job); PDFs regenerable + audit-logged. **AI-drafted personal thank-yous** referencing the donor's history — draft-then-approve, compliance text never AI-generated.
5. **Retention intelligence** (Bloomerang's most-loved feature, from our own data): LYBUNT/SYBUNT, lapse-risk flags from each donor's own giving cadence ("Jane gives every March; it's April"), recurring-donor health (≈90%/yr retention makes upgrades high-leverage), new-donor second-gift watch (the sector's weakest link), FEP benchmark panel (your retention vs sector ~43%).
6. **Segments**: saved filter trees on any field; export; (ESP sync later ring).

## Major Gifts

1. **Pipeline**: Identification → Qualification → Cultivation → Solicitation → Stewardship (Kanban + table), per-opportunity ask amount/date, probability, owner, capacity/affinity ratings, cultivation plan (sequenced touch tasks), contact reports.
2. **Portfolio view**: per-staff portfolio (25–50 focused prospects is the small-org norm), next-move-overdue flags.
3. **Pipeline math on the dashboard**: coverage vs goal gap (3x convention), gift-range chart for campaigns.
4. **Prospect research agent** (exists — evolve): the `funder-research` agent's briefs attach to constituents; migrate to structured outputs + Sonnet 4.6; add wealth-screening CSV import (DonorSearch/iWave) with capacity/affinity fields; provenance/citations mandatory.
5. **Next-best-action daily digest** (Virtuous Momentum at small-org price): "call X (gift anniversary in 20 days), Y's pledge installment is late, Z opened the proposal" — generated from rules + agent ranking, lands in the briefing + task suggestions.

## Grants (the differentiator nearly every small-org CRM lacks)

1. **Pipeline**: Prospect → Qualified → LOI → Proposal → Submitted → Awarded/Declined → Active → Closed. Funder = org constituent (shared record with its people).
2. **Requirements calendar — the killer feature**: every grant carries `grant_requirements` (LOI, application, interim/final/financial reports) with due dates; awarded grants auto-plot their reporting schedule; calendar view + Command Center surfacing + assigned tasks. (Instrumentl charges $179+/mo for this; we do tracking, **not** funder discovery.)
3. Award details: amount requested vs awarded, restrictions (links to restricted funds in Finance), grant period, program funded (links to Program for outcome data).
4. **AI grant support**: reusable org profile (mission, programs, outcomes, boilerplate); draft answers to application questions *grounded in our real program/impact data* (counters the "generic AI proposal" rejection pattern); funder-report drafts pulling actuals from Finance + outcomes from Impact. Always draft-then-approve + AI-use disclosure note generator (funder norms are tightening).

## Campaigns

Three-axis attribution (industry standard): **Campaign** (umbrella, goal, dates) / **Fund** (what for — carries GL/restriction; never hand-typed on gifts) / **Appeal** (which solicitation, with source codes). Every gift carries all three → ROI per appeal, progress vs goal, P2P ingestion (Givebutter teams/members attributed; P2P donors auto-segmented as acquisition-grade).

## Events

Givebutter-ticketed events sync (tickets, attendees → interactions on constituents); ticket FMV fields drive quid-pro-quo receipts; attendance feeds engagement scores. Internal events (Demo Day, Vision Night) share the component with Program. Full event ops (seating, auctions) stays in Givebutter.

## Reports & KPIs
Donor retention (overall/new/recurring), LTV, average gift by segment, CPDR per appeal, pipeline coverage, grants win rate, revenue mix (Finance crossover), top-donor concentration, acknowledgment SLA (% acknowledged <72h).

## Migration
HubSpot one-time importer: contacts/companies → constituents (source-tagged), deals → gifts/opportunities/grants by pipeline mapping, engagements → interactions. Parallel-run until parity; freeze HubSpot at cutover. Givebutter API key connection is Ring-2 week one (simple static key).

## Open questions
- Email sending depth in v1: log-and-template (mailto/Resend one-offs) vs built-in blast — recommend log-and-template first; ESP sync in a later ring.
- Whether AA's existing `donations` (Stripe) remains an active channel or Givebutter consolidates — affects ingestion priority only.
