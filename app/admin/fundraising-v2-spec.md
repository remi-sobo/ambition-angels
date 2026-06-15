# Spec: BloomOS Fundraising v2

Status: revised draft for review. Incorporates the consultant review and the discipline line from the working session. No code gets written until this is approved.
Intended repo path: `specs/fundraising-v2.md`
Supersedes: the first draft of this spec.

## Context and inputs

Synthesized from the working session, then sharpened against the consultant review. Correct anything wrong before approval.

- Problem: BloomOS fundraising runs in parallel with HubSpot, with no single source of truth and a stale one-way mirror. Remi wants to work entirely in BloomOS and retire HubSpot.
- Who is affected: Remi (primary operator today), Shannon (ops and finance support), and, later, tenant-2 nonprofits running BloomOS as their fundraising system.
- Current behavior: Remi works partly in BloomOS and partly in HubSpot. HubSpot holds contacts, per-person email history, donor history, and donor flow. The mirror is roughly 21 days stale and the two systems diverge. The module reads like a dashboard pointed at imported data, not the place a fundraiser lives all day.
- Desired behavior: Remi works entirely in BloomOS. HubSpot is off. Every constituent, gift, opportunity, grant, acknowledgment, and email thread lives in BloomOS as the canonical record, presented in one coherent, well-designed system with a clear daily rhythm.
- Out of scope for v2: the non-fundraising modules; commercial productization (billing, signup, marketing site, paid support). Multi-tenant readiness is in scope; selling to tenant 2 is not.
- Success, observable: HubSpot can be disabled for Ambition Angels with no daily capability lost, verified by the cutover acceptance test below; exactly one system of record per object; the module is consistent enough in design and data integrity that a second nonprofit could be onboarded behind a flag.

## Problem statement

Ambition Angels runs its fundraising across two systems that do not agree. BloomOS already holds a full nonprofit data spine and seven working surfaces, but HubSpot is still the day-to-day home for contacts, email history, and donor flow, and the link between them is a stale one-way mirror. The result is double entry, drift, and structured data living in description fields. v2 makes BloomOS the complete and only system of record for fundraising, retires HubSpot, and raises the module to a standard of design and intelligence that rivals paid platforms, with the fundraiser's daily rhythm at the center and Ambition Angels as the first tenant on an architecture that can later serve others.

## The locked decisions

1. BloomOS is the single source of truth for fundraising. HubSpot becomes a one-time importer, then is frozen and removed. No object is the system of record in both systems.
2. There is no marketing dependency on HubSpot. Per-person email history comes from Gmail, logged against each constituent inside BloomOS.
3. Payments (Givebutter plus the existing Stripe flow) feed gifts and recurring commitments into BloomOS as the most critical inbound integration.
4. Real row-level security keyed on org is the floor for a second tenant, built now even though Ambition Angels is the only tenant today.
5. Every person or organization is one constituent record. The fundraising surfaces are views over a shared set of objects, never separate identities.

## Core objects, and the views over them

The canonical objects:
- Constituent: a person, organization, or household. The canonical identity.
- Gift: a completed donation (one-time, recurring instalment, pledge payment, in-kind).
- Pledge: a committed future total, paid down by gifts.
- Opportunity (ask): a potential future gift in the moves pipeline.
- Interaction: an email, call, meeting, note, or event attendance.
- Task or next move: an action owed on a constituent or opportunity.
- Campaign, appeal, fund: attribution and restriction axes.
- Event: a gathering with attendance and gifts.

The surfaces are views over those objects, not separate records:
- Constituent 360 = the canonical profile for one constituent.
- Today's Fundraising Moves = the operator's action queue across constituents.
- Prospects = constituents with a prospect score or qualification status.
- Donors = constituents with at least one gift.
- Major Gifts = opportunities above a threshold or marked major.
- Acknowledgments = gifts needing a receipt or thanks.
- Campaigns = attribution and performance.
- Events = attendance and gifts tied to an event.

The rule that protects trust: a person who is a prospect, a donor, and a major-gift ask is one constituent, with one giving history and one set of opportunities, shown in three views. They never become three records.

## The two surfaces that anchor daily work

These are the heart of the product, and they are what turns a dashboard into a workplace.

### Constituent 360 (the profile, the center of gravity)

In fundraising software the profile is where trust is built. There is one canonical profile per constituent.

v1 leads with four questions: who are they, what is the relationship, what have they given or might they give, and what is the next move. Plus the email timeline. v1 renders that lead block, the email and interaction timeline, a giving summary, and the next move.

Full target, progressively disclosed so the profile never becomes a dense everything-page: contact info; household and company relationships; giving history; soft credits; opportunities; grants where relevant; campaign and event attendance; notes; tasks and next moves; AI brief; dedupe warnings; source and external IDs; communication preferences; acknowledgment history.

### Today's Fundraising Moves (the operator home screen)

Answers one question: who needs me today, and what do I do next. Not pipeline totals. It shows overdue next steps, open asks nearing expected close, new gifts needing acknowledgment, high-value prospects with no recent touch, warm prospects with no owner, lapsed donors worth recovering, upcoming meetings, and recently engaged donors. The next-best-action agent feeds this surface. The agent suggests; the operator acts.

## Scope

In:
- The seven existing surfaces, upgraded and reframed as views over the objects.
- Two anchor surfaces: Constituent 360 and Today's Fundraising Moves.
- The per-constituent email and communications history (the keystone of HubSpot removal).
- Source-of-truth flip: demote the HubSpot mirror to a one-time importer, then freeze it.
- Payments ingestion: Givebutter alongside Stripe, including pledges and recurring.
- Design-system unification across all surfaces.
- Real row-level security and auth hardening.
- AI upgrades (research agent, grant drafting, next-best-action, standardized draft-then-approve).
- The Events module and the deeper gift types are in v2, but sequenced after cutover (see staging).

Out:
- Ops, Finance, Program, and Governance modules.
- Commercialization: billing, signup, pricing, marketing site, paid support.
- Anything requiring a second live tenant.

## Architecture sketch

No code. Data flow, ownership, and dependencies only.

```
  Givebutter + Stripe ──(gifts, recurring, pledges, refunds)──▶  BloomOS  ◀──(emails, threads)── Gmail (OAuth)
                                                                   │
                                                  system of record, one constituent per person:
                                          constituents · gifts · pledges · opportunities · grants
                                          acknowledgments · interactions · campaigns · funds · events
                                                                   ▲
                                       HubSpot ──(one-time import into staging, then frozen)──┘
```

Ownership after cutover: BloomOS owns every fundraising object; Gmail is the upstream source for email content only; Givebutter and Stripe are upstream for money only; HubSpot owns nothing and is disconnected.

Key structural moves:
- Source-of-truth flip. The `hs_*` mirror is demoted to import staging and reconciled to `constituents` via `external_ids`. After import the live sync job is retired.
- Email keystone. Gmail OAuth syncs messages, matches them conservatively to constituents by verified address, and stores them as interactions of type email with thread references. Constituent 360 renders the timeline. This is the single feature that removes the last reason to open HubSpot.
- Real RLS. Row-level security on every fundraising table keyed on `org_id`, with membership and role as the enforced gate. The service-role bypass on per-request writes is removed or scoped. This is the line between an internal admin tool and a product another org can log into.
- Design-system unification. One page anatomy (breadcrumb and title with primary action, a stat-card KPI strip, the main table or board or detail, optional right rail), one stat-card, one server-paginated table (saved views, column picker, CSV, bulk actions), one pipeline component, a global command palette, and the draft-then-approve affordance on every AI surface.

## Gmail sync: scope and privacy

Email logging is a trust feature. A wrong or sensitive thread on a donor profile is worse than a missing one. Settle these before any sync runs:
- Which mailboxes are in scope (Remi, Shannon, a shared address).
- Which labels or folders sync, and which are excluded.
- Internal staff-to-staff email: excluded by default.
- Personal and family email: excluded. Match only verified constituent addresses, never fuzzy name matching that could attach the wrong person.
- A user can unlink a thread from a constituent.
- A user can mark a thread private so it does not appear on the profile.
- A user can correct a mis-matched thread.

## Gift and money model

Cutover-minimum handling: one-time gifts, recurring instalments, pledges and pledge payments (a pledge is a committed total; gifts pay it down; the profile shows pledged, paid, and outstanding), refunds, fees, net versus gross, restricted funds, campaign and appeal and source attribution, soft credits, and anonymous handling. Ingestion is idempotent and reconciled nightly across Givebutter webhooks and the existing Stripe trigger flow.

Post-cutover depth (Phase 3, does not gate cutover): DAF gifts, matching gifts, tribute gifts, year-end consolidated statements, in-kind.

## What changes, by surface

Keep, add, remove, adjust. Every surface is a view over the shared objects.

Major Gifts
- Keep: the moves Kanban, KPIs, inline new ask, stage advance and retreat, capacity dots.
- Add: per-owner portfolio view (portfolio value, assigned count, open asks, overdue moves, last-touch distribution, top ten to contact, stage movement this month, expected revenue); coverage-versus-goal using the 3x convention plus a gift-range chart; wealth-screening CSV import populating capacity and affinity. Cards show last touch, next move, owner, and status, not just name and amount.
- Remove: nothing.
- Adjust: source opportunities from `constituents` after cutover; standardize on the shared pipeline component.

Prospects
- Keep: the triage list and scoring.
- Add: score as a sortable first-class column from the native spine; saved views.
- Remove: the `hs_*` dependency at cutover; fix the h1 that reads "Fundraising" and the sort and filter links that point to the section root.
- Adjust: rebuild on the shared table; it is a view over constituents.

Constituent profile (was prospect detail plus donor profile) becomes Constituent 360
- Keep: the AI research brief, the seven-dimension score editor, the giving timeline.
- Add: the unified profile described above, the email timeline, the next-move block, dedupe warnings.
- Remove: the separate prospect-detail and donor-profile routes; collapse into one constituent route after cutover.
- Adjust: migrate the agent to structured outputs and Sonnet 4.6, preserving budget caps, rate limits, and logging.

Donors
- Keep: the rollup, retention intelligence, segment export.
- Add: households with automatic soft-credit; the first-class dedupe and merge queue; full FEP retention; pledges shown.
- Remove: the apply-migration empty-state once the spine is default.
- Adjust: Donors is a view (constituents with gifts).
- Post-cutover depth: DAF, matching, tribute, year-end statements.

Grants
- Keep: the stage pipeline and the requirements and deadline calendar.
- Add (post-cutover): AI grant-answer drafting grounded in program and impact data; funder-report drafts from Finance actuals and outcomes; a reusable org profile and boilerplate store; an AI-use disclosure generator.
- Adjust: standardize the layout.

Campaigns
- Keep: attribution and safe bulk-attribute.
- Add (post-cutover): the Fund axis in the UI; per-appeal ROI and cost-per-dollar-raised; Givebutter peer-to-peer attribution.

Acknowledgments
- Keep: the pending queue, AI draft-then-approve, the server-built IRS block.
- Add: the surface to the sidebar; a real workflow (pending, IRS status, thank-you status, draft, approve and send and export, household acknowledgment logic, do-not-acknowledge and special handling, communication preferences); year-end statements connect here (post-cutover).
- Adjust: nothing structural.

Email and communications (new)
- Add: the per-constituent email timeline on Constituent 360, plus a lightweight global communications view. Keystone of HubSpot removal.

Events (new module, post-cutover)
- Add: Givebutter ticketing synced to interactions; fair-market-value handling that produces quid-pro-quo receipts; attendance that feeds engagement scoring.

## Dedupe and merge

Once HubSpot, Gmail, Givebutter, and Stripe all feed in, duplicates are inevitable, and a bad merge is hard to reverse. The merge review must show why records may match, a confidence score, conflicting fields, a gift-history comparison, an email-history comparison, external IDs, a preview of the merged record, and an undo and audit trail. Merges are reviewed, previewed, and logged, never automatic.

## Data model changes

Add: an email and message store (or an extension of `interactions`) with thread references and direction; population of `households` and `soft_credits`; pledge and pledge-payment structures; a dedupe and merge review structure with audit trail; an org profile and boilerplate table; events tables.

Adjust: enforce `org_id` and RLS on every fundraising table; reconcile `hs_*` to `constituents` via `external_ids` during import; derive opportunity type from `constituents.type` rather than storing it separately.

Remove or freeze: retire the live HubSpot mirror role. Keep `hs_*` as archived import staging through cutover, then disconnect the sync job.

## AI layer v2

- Migrate the funder-research agent to structured outputs and Sonnet 4.6, preserving the budget cap, per-user rate limit, token accounting, and activity log.
- Add grant-answer drafting and funder-report drafting, grounded in real program, impact, and finance data, each behind draft-then-approve with an AI-use disclosure (post-cutover).
- Add the next-best-action digest that feeds Today's Fundraising Moves.
- Keep acknowledgment drafts on Sonnet with the IRS block server-built and never AI-generated.
- Guardrail: AI drafts, summarizes, recommends, and explains. It never becomes the source of truth and never silently mutates a constituent, gift, receipt, or grant record. Every AI surface is draft-then-approve, never auto-send or auto-save.

## Cross-cutting platform

One page anatomy and the shared components above; auth hardening and real RLS; a Command Center fundraising-pipeline funnel widget; Givebutter ingestion via webhooks with nightly reconciliation alongside Stripe; onboarding empty states; quiet-by-default notifications.

## The cutover acceptance test

This is the hard gate. HubSpot is turned off only when all of the following work end to end in BloomOS against real Ambition Angels data:

1. Find a constituent by name or email.
2. See their full contact and giving history.
3. See their email history.
4. Log a note, call, or meeting.
5. Create a next move with an owner and due date.
6. Create an opportunity and advance its stage.
7. Import or sync a gift from Givebutter or Stripe.
8. Acknowledge a gift, with the IRS block where required.
9. Export a donor segment.
10. Handle a duplicate through the merge queue.
11. Produce a basic donor report.

This list is the definition of v2-minimum, and it is the only thing that gates turning HubSpot off. Everything not on this list (DAF and matching and tribute gifts, year-end statements, Events, AI grant drafting, P2P, the full Constituent 360) is sequenced after cutover and does not block it. A working Constituent 360 v1 is required, because items 1 through 6 render on it.

## Staged build order

Each gate ends at a reviewable commit point. One PR at a time inside each gate.

Phase 0A: Data and security foundation. RLS on all fundraising tables, `org_id` enforcement, `external_ids` reconciliation, the import-staging model, and a cross-org read test that must fail. Commit point: cross-org reads provably blocked; `hs_*` is read-only staging.

Phase 0B: Design foundation. The shared page anatomy, stat-card, server-paginated table, and pipeline component, migrated onto one surface. Commit point: one surface fully on the shared system.

Phase 1A: Import rehearsal. Import HubSpot into staging, compare counts, detect duplicates. No cutover. Commit point: a reconciliation report exists and has been reviewed.

Phase 1B: Dedupe and merge. Work the merge queue to zero conflicts, confirm constituent identity, preserve the audit trail. Commit point: merge queue at zero, audit trail intact.

Phase 1C: Constituent 360 v1 and Gmail logging. Build the v1 profile (lead block, giving summary, next move) and sync the agreed mailboxes and labels, matching conservatively, rendering the email timeline with manual correction and private-thread handling. Commit point: a constituent shows correct contact, giving, and email history, and mis-matches can be fixed.

Phase 1D: Cutover. Freeze HubSpot, switch reads to the native spine, disconnect the live mirror. Gated by the cutover acceptance test. Commit point: all eleven acceptance items pass; HubSpot disconnected.

Phase 2: Daily rhythm and stickiness. Today's Fundraising Moves, the full Constituent 360 (progressive disclosure), Major Gifts portfolio and coverage and next-best-action, Donors households and soft-credit and full retention, and the agent on Sonnet 4.6. Commit point: Remi and Shannon run a full week without opening HubSpot.

Phase 3: Rivalry features. Grants AI drafting and funder reports; Campaigns Fund axis and ROI and P2P; Acknowledgments year-end statements; DAF and matching and tribute gifts; the Events module; the Command Center funnel. Commit point: each shipped on the unified design system.

Phase 4: Productization readiness. Tenant onboarding, migration tooling, security posture, support model. Out of scope to detail here. Gated by Phase 0A.

## Definition of done

Overall:
- HubSpot is disabled for Ambition Angels, verified by the eleven-item cutover acceptance test.
- Every fundraising object has exactly one system of record, and it is BloomOS. A person is one constituent.
- Every surface uses the shared design system.
- RLS is enforced on every fundraising table, verified by a test that one org cannot read another org's rows.
- Every AI surface is draft-then-approve and never auto-sends or auto-saves.

Per gate:
- 0A: a test confirms cross-org reads fail; the mirror is read-only staging.
- 0B: one surface is fully on the shared components.
- 1A: a reconciliation report exists and has been reviewed.
- 1B: the merge queue is at zero with an intact audit trail.
- 1C: a constituent profile shows correct contact, giving, and email history, and mis-matches can be corrected.
- 1D: all eleven acceptance items pass and HubSpot is disconnected.
- 2: a full week runs with HubSpot unopened; Today's Moves and the full profile are live.
- 3: a grant answer can be drafted and approved; a campaign shows per-appeal ROI; an event produces a quid-pro-quo receipt.

## Failure modes to watch for

- Half-done cutover. If the source-of-truth flip starts but both systems stay live, the org keeps double-entering and the data diverges further. This is the current failure, deeper. Manifests as Remi trusting neither system. Mitigation: Phase 1 is all-or-nothing for cutover; not done until HubSpot is disconnected.
- Email matching and privacy. The Gmail keystone can mis-match messages, miss threads, or log emails that should not be logged. Manifests as wrong or sensitive content on a donor profile. Mitigation: verified-address matching only, manual correction, private-thread handling, and an explicit mailbox and label scope decided before syncing.
- RLS left bypassed. The service-role client is convenient and easy to leave in, which is fine for one tenant and catastrophic for two. Manifests as one nonprofit seeing another's donors. Mitigation: the cross-org read test is a hard gate on Phase 0A and any later multi-tenant work.
- Import data loss or duplication. The one-time import can duplicate against the native spine or drop records. Manifests as inflated donor counts or missing history. Mitigation: the import rehearsal and the merge queue to zero before freezing the mirror.
- Constituent 360 becomes a dense everything-page. Rendering every field at once makes the profile unreadable. Manifests as an operator who cannot find the one thing they need. Mitigation: v1 is the lead block plus email, giving, and next move; everything else is progressively disclosed.
- Scope creep delays cutover. The depth this spec adds is real but heavy, and pulling it forward starves the cutover. Manifests as a long runway with HubSpot still on. Mitigation: the eleven-item acceptance test is the only cutover gate; feature depth is Phase 2 and 3.
- Design unification touching everything at once. Reskinning all surfaces in one pass is a large radius. Manifests as a long-lived branch that is hard to review. Mitigation: land the shared components on one surface in 0B, then migrate surfaces one PR at a time.
