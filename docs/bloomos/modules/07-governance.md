# Module 07 — Governance

**Sidebar:** Board · KPIs · Strategic Plan · Compliance
**Job:** run a healthy, compliant 501(c)(3): board lifecycle + meetings + packets, the org's KPI scorecard, the strategic plan connected to actual work, and the compliance calendar. Research finding: meeting mechanics are commoditized ($79–95/mo incumbents), but **the governance lifecycle — terms, COI, board giving, quorum, consents — is unserved at small-org prices.** That's our angle.

## Board

**Lifecycle (the differentiators):**
1. **Members & terms**: officer roles (chair/secretary/treasurer with conflict validation — most states bar president=secretary), term start/end, term number vs limits (2×3yr BoardSource default, configurable), staggered classes with expiry alerts. (Only 54% of boards track term limits — automatic tracking is genuinely unmet need.)
2. **Annual COI disclosure**: e-sign workflow (clickwrap) per member per year — **directly answers Form 990 Part VI Q12** ("regularly and consistently monitored and enforced"); status grid; new-member onboarding packet.
3. **Board giving**: per-member annual give/get status → the **"100% board participation" badge** funders ask about, exportable for grant applications.
4. **Attendance & quorum**: per-meeting attendance, rolling % per member, quorum auto-check vs bylaws threshold before votes.
5. Annual self-assessment survey (BoardSource-style template, runs on the Surveys engine).

**Meetings & packets:**
6. **Packet generator (the whitespace feature)**: one click assembles agenda + finance package (modules/04) + program dashboard + ED report (briefing-derived draft) + prior minutes into a branded PDF; distributed via **magic-link board portal** (no-password reading experience — month-one adoption is the whole game for volunteer directors; board_viewer role).
7. **Agenda builder** with a **consent-block item type** (bundle routine approvals into one motion; any member can pull an item) — saves 20–30 min/meeting.
8. **Minutes**: template enforcing the legal fields (attendance/quorum, motion text, mover/seconder, tally for/against/abstain, follow-ups) — AI-drafted from notes, secretary-approved; approve-at-next-meeting workflow; **immutable after approval; permanent retention class**. Executive-session minutes separate + restricted.
9. **Between-meeting actions**: unanimous-written-consent e-votes (enforces unanimity — non-unanimous email votes are generally invalid), e-signature capture, auto-filed into the minute book.

## KPIs (the org scorecard)

A curated scorecard over the metric registry: 12–15 indicators max, each with owner, target, RAG status, trend, and linked initiative. Default set drawn from each module's KPI list (months of cash, donor retention, students served, attendance rate, pipeline coverage, program ratio…). Views: board (outcome-weighted), ops (weekly), funder (per-grant). Monthly snapshot history (`kpi_snapshots`). This page is "Results-Based Accountability lite" — how much / how well / is anyone better off.

## Strategic Plan

1. Plan → goals → initiatives → linked projects/tasks (Ops) and KPIs — the plan stays alive because it's wired to actual work, not a PDF.
2. Progress roll-up (initiative % from linked work + KPI movement); annual/quarterly review pages; board-packet section auto-generated.
3. The existing `/strategy` Strategy Room content migrates here.

## Compliance (the calendar engine)

Research: nonprofits juggle dozens of unsynchronized due dates across three bases — **fixed-date** (Jan 31 W-2/1099; 941 quarterlies), **FYE-offset** (Form 990 = FYE+4.5mo with 8868 extension; CA RRF-1; NY CHAR500), **anniversary** (FL charitable renewal, corporate annual report, insurance, registered agent). Normalizing these is the product.

1. **Compliance items** with rule-based recurrence (`basis: fixed_date | fye_offset | anniversary`), jurisdiction, assignee, status, evidence attachment (filed copy → Documents). Seeded template library on org setup: 990 family (with the **3-year auto-revocation clock** warning), state charitable registration for the org's solicitation states, corporate report, sales-tax exemption renewals, insurance renewals (GL/D&O/cyber/workers-comp + premium-audit window), employment cadence (941s, W-2/1099-NEC with the $2,000 2026 threshold note), policy reviews (COI annual, document-retention), public-disclosure obligations (3 years of 990s + 1023 + determination letter — pair with a "post to website" action).
2. **Contract/vendor tracker**: counterparty, value, term, auto-renew flag, **notice-deadline alert** (30–90d windows — the auto-renewal trap), owner, W-9-on-file flag + YTD payments vs 1099 threshold → January filing list.
3. Calendar + list views; Command Center surfacing; weekly digest of items due <30d.
4. Disclaimer rail: deadlines are jurisdiction-templates, not legal advice; link to authoritative sources per item.

## KPIs
On-time filing rate, items overdue, COI coverage %, board attendance %, board giving %, packet prep time (<30 min target), days-to-minutes-approval.

## Open questions
- AA's solicitation-state footprint (which state registrations apply) — seed data workshop.
- Board portal: same app with board_viewer role (recommended) vs separate surface.
- Whether quorum/bylaws thresholds vary per committee (committees are v2).
