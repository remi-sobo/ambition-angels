# BloomOS V2 — Preservation ledger

Phase 0.5, 2026-09-03 · read-and-report only. Companion to `docs/v2-recon.md` and the V2 preservation-gate section of the spec.

**Scope note:** live `public` schema holds **182 base tables**, of which 4 are monthly partitions of `audit_log` (folded into one logical row per the gate) → **178 ledger rows**. The gate's "181 as of 2026-09-03" was a slightly stale snapshot. Row counts are exact `count(*)` at ledger time. `written_by`/`read_by` are traced from the codebase (every `.from("…")` call site in `app/`, `lib/`, `scripts/`), not from the design bundle.

**Path abbreviations:** `A/` = `app/admin/`, `X/` = `app/api/admin/`, `P/` = `app/api/` (public/cron/reed/games), `L/` = `lib/`. "Site" = the public marketing/teens site.

**One stated convention (Remi can veto):** tables owned by the **public site** (teen games, quiz, analytics beacons, donate flow) are marked `bound` with the public route cited. The V2 rebuild touches only `/admin`; the site keeps writing and reading these tables regardless, so they are claimed — just not by an admin screen. They are labeled `site:` in the disposition so they're easy to re-rule.

---

## Summary

| Disposition | Count |
|---|---|
| bound | 89 |
| settings | 30 |
| dormant | 14 |
| **NEEDS RULING** | **45** |
| **Total** | **178** |

### NEEDS RULING, sorted by rows descending — read this first

| Table | Rows | Why it has no seat |
|---|---|---|
| `fr_prospects` | 550 | prospect-research module (`ai.prospect_research`) demoted to "a saved view" with no design |
| `game_pool` | 217 | teen-games eligibility gate; `/admin/careers/pool` is NO V2 HOME |
| `game_daily` | 67 | Never Heard of It calendar; `/admin/careers/daily` is NO V2 HOME |
| `connection_candidates` | 58 | meetings-connections pipeline; `/admin/meetings/connections` mapped to Settings with no design |
| `quiz_submissions` | 49 | `aa.quiz` has no V2 home |
| `reed_messages` | 24 | `/admin/reed` removed ("Reed is not a destination") with no archive plan |
| `fr_prospect_disqualified` | 20 | prospect-research family |
| `participant_stages` | 22 | Programs → People drawn with a fixed column set; per-org stages unrepresented |
| `custom_field_defs` | 16 | same — per-org custom fields unrepresented in the People design |
| `demoday_signups` | 14 | pinned Group view mechanism is undesigned |
| `fr_agent_activity_log` | 14 | prospect-research family |
| `email_sends` | 13 | `modules.comms` has no V2 seat |
| `stewardship_rules` | 11 | appears in no design file (drives the stewardship-milestones cron) |
| `meeting_types` | 9 | `/admin/meet` booking admin is NO V2 HOME |
| `funder_angles` | 8 | fundraising strategy room unmapped |
| `reed_threads` | 8 | Reed archive, as above |
| `strategy_angles` | 8 | strategy room unmapped (also read by the public `/strategy` page) |
| `ygb_registrations` | 8 | `aa.ygb` pinned view undesigned |
| `review_competencies` | 5 | `modules.reviews` has no V2 seat |
| `bookings` | 4 | meet family (public booking flow writes it) |
| `email_campaigns` | 4 | comms family |
| `fr_prospect_scores` | 3 | prospect-research family |
| `org_comms_settings` | 2 | comms family (2 rows — includes SafeSpace comms config) |
| `agenda_delegations` | 1 | meet/agenda family |
| `blackouts` | 1 | meet family |
| `demoday_notes` | 1 | Demo Day family |
| `fr_prospect_briefs` | 1 | prospect-research family |
| `plan_archives` | 1 | written by the manual OGSM-v3 archive migration; nothing reads it |
| `strategy_room_meta` | 1 | strategy room family |
| — zero-row — | | |
| `bv_newsletter_subscribers`, `bv_showcase_submissions` | 0 | `aa.bv`: **zero code references anywhere** — drop candidates, but that's a ruling |
| `entity_comments` | 0 | comments unmapped (Inbox got Messages only) |
| `fr_email_drafts`, `fr_funding_opportunities`, `fr_nba_suggestions`, `fr_prospect_promoted`, `fr_touches`, `research_runs` | 0 | prospect-research family — one ruling covers all |
| `meeting_exclusions` | 0 | meet family |
| `review_cycles`, `review_feedback`, `review_manager_notes`, `review_summaries` | 0 | reviews family — one ruling covers all |
| `segments` | 0 | **the saved-view backbone: zero rows, no builder UI** — either the builder is Phase 1 scope or the nine collapsed fundraising pages stay |
| `ygb_attendance` | 0 | YGB family |

These 45 rows cluster into **11 rulings**: prospect research (11 tables), meet/booking (6), comms/email (4), reviews (5), Reed archive (2), strategy room (3), teen-games gates (2), Demo Day (2), YGB (2), participant spine visibility (2), and singletons (`stewardship_rules`, `quiz_submissions`, `plan_archives`, `entity_comments`, `segments`, `bv_*`).

---

## The ledger

One row per logical table, alphabetical. `ruling` is empty everywhere — Remi fills it; it is **required** for every `NEEDS RULING` and `dormant` row before Phase 1.

| table | rows | written_by | read_by | disposition | ruling |
|---|---|---|---|---|---|
| ack_templates | 6 | X/fundraising/ack-templates | A/fundraising/acknowledgments/templates, L/fundraising/stewardship | settings — Settings → Fundraising (ack templates) | |
| acknowledgments | 1 | X/acknowledgments/{log,mark,send} | A/fundraising/donors/[id], L/fundraising/stewardship | bound — Fundraising → Today ("Thank someone") | |
| agenda_delegations | 1 | L/agenda/service | L/agenda/week-view | **NEEDS RULING** — meet/agenda family | |
| appeals | 3 | X/appeals | A/fundraising/campaigns, A/fundraising/donors/[id] | bound — Fundraising → Campaigns | |
| applications | 0 | P/apply (public form), X/applications/[id] | A/intake | bound — Programs → Intake | |
| ask_documents | 0 | X/asks/[id]/documents | A/fundraising/asks/[id], L/fundraising/grantCoachDocs | bound — Fundraising → Pipeline (ask drawer) | |
| asks | 3 | X/asks | A/fundraising/asks, A/fundraising/grants/[id] | bound — Fundraising → Pipeline (ask log, merged) | |
| attendance | 231 | X/sessions/[id]/attendance | A/cohorts, A/students/[id], L/admin/briefing/gather | bound — Programs → Attendance | |
| audit_log (+4 monthly partitions) | 610 | L/audit (every audited mutation) | L/admin/history, L/briefing, P/cron/weekly-digest | bound — Contract 7 audit history (close/waiver record on Finance → Transactions) | |
| blackouts | 1 | X/meet/blackouts | A/meetings/booking-page, L/availability | **NEEDS RULING** — meet family | |
| bloomos_briefing_narrative | 9 | L/admin/briefing/narrate | same | bound — Home → Today (briefing) | |
| bloomos_briefing_state | 6 | X/briefing/decision | L/admin/briefing/gather | bound — Home → Today (briefing) | |
| board_meetings | 5 | X/board/meetings | A/board | bound — Organization → Board | |
| board_members | 12 | X/board/members | A/board | bound — Organization → Board | |
| bookings | 4 | P/meet/book (public), X/meet/connections/[id]/book | A/meetings, P/cron/meet-reminders, X/search | **NEEDS RULING** — meet family (public booking flow writes it) | |
| briefings | 0 | L/briefing | A/briefing/weekly | bound — Home → Today (briefing store; note: `/admin/briefing/weekly` itself is NO V2 HOME) | |
| bv_newsletter_subscribers | 0 | — (no code references) | — | **NEEDS RULING** — `aa.bv`, orphaned | |
| bv_showcase_submissions | 0 | — (no code references) | — | **NEEDS RULING** — `aa.bv`, orphaned | |
| calendar_events | 283 | L/agenda/calendar-sync (Google sync) | L/agenda/*, L/meetings/*, A/ops/monday | bound — Work → My Week | |
| calendar_prefs | 0 | X/calendar/prefs | L/agenda/prefs | settings — Settings → Calendar (working hours) | |
| calendar_sync_jobs | 217 | L/agenda/calendar-sync | L/google/connection | settings — Settings → Data sources (sync log) | |
| campaigns | 3 | X/campaigns | A/fundraising/campaigns, A/fundraising/plan | bound — Fundraising → Campaigns | |
| click_events | 347 | P/analytics/event (site) | X/analytics | bound — Impact → Analytics (site engagement) | |
| cohort_members | 75 | X/cohorts/[id]/members, X/applications/[id]/accept | A/cohorts, A/intake, A/students/[id] | bound — Programs → Cohorts | |
| cohort_sessions | 39 | X/cohorts/[id]/sessions | A/cohorts, L/admin/briefing/gather | bound — Programs → Attendance | |
| cohorts | 9 | X/cohorts | A/cohorts, A/intake, P/apply | bound — Programs → Cohorts | |
| comms_edition_slots | 0 | (comms module, unbuilt UI writes) | A/fundraising/comms area | dormant — `specs/comms-v2-mail-merge.md` | |
| comms_editions | 0 | same | same | dormant — `specs/comms-v2-mail-merge.md` | |
| comms_formats | 0 | same | same | dormant — `specs/comms-v2-mail-merge.md` | |
| comms_outputs | 0 | same | same | dormant — `specs/comms-v2-mail-merge.md` | |
| compliance_filings | 7 | X/compliance/[id]/filings | A/compliance/[id] | bound — Organization → Compliance (named preservation: Contract 3's resolve path must write it) | |
| compliance_items | 20 | X/compliance | A/compliance, L/briefing, P/cron/daily-reminders | bound — Organization → Compliance | |
| connection_candidates | 58 | L/fundraising/gmail-sync | A/meetings/connections, X/meet/connection-candidates | **NEEDS RULING** — meetings-connections family | |
| connections | 16 | L/google/connection, L/hubspot/connection (OAuth tokens) | A/fundraising/settings, X/integrations/hubspot | settings — Settings → Data sources (integration connections; note: the gate filed this under "meet" — the code says it is OAuth storage) | |
| constituents | 3,631 | X/constituents/*, imports, L/fundraising/promote-hs-contact | A/fundraising/donors, A/fundraising/volunteers, A/students, X/search, 40+ more | bound — Fundraising → Donors & Funders (+ Donor 360) | |
| custom_field_defs | 16 | (seeded; registry per participant-spine spec) | L/admin/customFields | **NEEDS RULING** — People design shows fixed columns; per-org fields unrepresented | |
| cut_players | 4 | P/games/the-cut/room/[code]/join | P/games/the-cut/* | bound — site: `/teens/the-cut` (ephemeral by design) | |
| cut_rooms | 5 | P/games/the-cut/room | P/games/the-cut/* | bound — site: `/teens/the-cut` (ephemeral) | |
| cut_votes | 16 | P/games/the-cut/room/[code]/vote | P/games/the-cut/room/[code]/resolve | bound — site: `/teens/the-cut` (ephemeral) | |
| demoday_notes | 1 | X/demoday/notes | same | **NEEDS RULING** — Demo Day pinned view undesigned | |
| demoday_signups | 14 | P/demoday/signup (site) | X/demoday/signups | **NEEDS RULING** — Demo Day pinned view undesigned | |
| document_links | 9 | X/documents/[id]/links | L/agents/reed/tools, L/fundraising/grantCoachDocs | bound — Work → Documents ("attached to") | |
| documents | 19 | X/documents | A/documents, L/agents/reed/tools, P/reed | bound — Work → Documents | |
| donations | 2 | P/save-donation + P/stripe-webhook (site) | L/admin/overview/sources (V1 cockpit) | bound — site: `/donate` flow (note: its only admin reader is the V1 cockpit, which dies — verify the Stripe→gifts reconciliation path replaces it) | |
| email_campaigns | 4 | X/comms | A/fundraising/comms, L/admin/plan/metrics | **NEEDS RULING** — `modules.comms` has no V2 seat | |
| email_sends | 13 | X/comms/[id]/send | same | **NEEDS RULING** — comms family | |
| email_suppressions | 0 | P/unsubscribe (public), P/cron/journeys | L/fundraising/segments | settings — email infrastructure (legally required unsubscribe list; survives regardless of comms ruling) | |
| entity_comments | 0 | X/comments | X/comments/[id] | **NEEDS RULING** — comments unmapped in V2 | |
| entity_types | 22 | (seeded) | L/admin/entities (terminology fallback) | settings — terminology infrastructure | |
| external_refs | 4,376 | X/imports/[id]/{stage,commit} | same (dedup/reconciliation) | settings — import/dedup infrastructure (`specs/bloomos-import-layer.md`; also the HubSpot reconciliation spine) | |
| fin_budget | 76 | X/finance/budget/import | A/finance/budget, A/finance/report | bound — Finance → Budget | |
| fin_categories | 122 | X/finance/budget/import, seeds | A/finance/transactions, A/finance/rules | bound — Finance → Transactions (category dimension) | |
| fin_category_rules | 98 | X/finance/rules | A/finance/rules, L/finance/categorize | settings — Settings → Finance (categorization rules) | |
| fin_config | 3 | A/finance/config, finance-balance skill (Gmail cash anchor) | L/admin/finance, L/admin/strategy/money, L/agents/reed/tools | bound — Finance → Snapshot (cash anchor + freshness) | |
| fin_imports | 4 | X/finance/import | A/finance/close | settings — Settings → Finance (import history) | |
| fin_reconciliation_items | 1 | X/finance/reconciliation, finance-reconcile skill | A/finance/reconcile | bound — Finance → Transactions (exception queue) | |
| fin_revenue_commitments | 14 | X/finance/revenue | A/finance/revenue, X/search | bound — Finance → Forecast (committed tier) | |
| fin_transactions | 544 | X/finance/import, X/finance/categorize | A/finance/transactions, A/finance/close, L/admin/finance | bound — Finance → Transactions | |
| fr_agent_activity_log | 14 | X/fundraising/{next-move,research,strategy/discover} | same | **NEEDS RULING** — prospect-research family | |
| fr_email_drafts | 0 | (prospect-research agent) | — | **NEEDS RULING** — prospect-research family (zero rows) | |
| fr_funding_opportunities | 0 | (prospect-research agent) | — | **NEEDS RULING** — prospect-research family (zero rows) | |
| fr_nba_suggestions | 0 | X/fundraising/next-best-action | L/admin/briefing/fundraising | **NEEDS RULING** — prospect-research family (zero rows) | |
| fr_prospect_briefs | 1 | X/fundraising/research/[id] | A/fundraising/prospects/[id], A/fundraising/donors/[id] | **NEEDS RULING** — prospect-research family | |
| fr_prospect_disqualified | 20 | X/fundraising/prospects/disqualify | A/fundraising/prospects | **NEEDS RULING** — prospect-research family | |
| fr_prospect_promoted | 0 | X/fundraising/prospects/promote | — | **NEEDS RULING** — prospect-research family (zero rows) | |
| fr_prospect_scores | 3 | X/prospects/[id]/score | A/fundraising/prospects | **NEEDS RULING** — prospect-research family | |
| fr_prospects | 550 | X/fundraising/prospects/{add,import,promote}, strategy/discover | A/fundraising/prospects, X/search, L/fundraising/grantCoachDocs | **NEEDS RULING** — demoted to a saved view with no design; 550 rows | |
| fr_touches | 0 | (deprecated per code comment in L/admin/rail/needs-you) | — | **NEEDS RULING** — prospect-research family (zero rows) | |
| funder_angles | 8 | X/strategy/funder-angles | A/fundraising/strategy, A/fundraising/prospects/[id], L/fundraising/link-prospect-angle | **NEEDS RULING** — strategy room unmapped | |
| funds | 3 | (seeded/edited with gifts coding) | A/fundraising/donors/[id], A/fundraising/reports, X/gifts/export | bound — Finance → Snapshot (restricted/unrestricted split) | |
| game_daily | 67 | A+X/careers/daily (human scheduling) | P/games/daily (site) | **NEEDS RULING** — `/admin/careers/daily` NO V2 HOME (proposal: Programs → Content section) | |
| game_pool | 217 | A+X/careers/pool (human gate) | P/games/{daily,higher-wage,the-cut} (site) | **NEEDS RULING** — `/admin/careers/pool` NO V2 HOME (proposal: Programs → Content section) | |
| gifts | 317 | X/gifts, imports, stripe path | A/fundraising/{today,donors,campaigns,plan}, A/finance, A/board, 30+ more | bound — Fundraising → Today / Donors & Funders; Finance → Forecast (received tier) | |
| gmail_sync_jobs | 2 | L/fundraising/gmail-sync | same | settings — Settings → Data sources | |
| grant_contacts | 0 | L/fundraising/grantContacts | same | bound — Fundraising → Grants (contacts) | |
| grant_payments | 5 | — (no code writer; rows entered by SQL/migration) | `v_revenue_schedule` → L/finance/schedule | bound — Finance → Forecast (scheduled grant payments; note: needs a UI writer eventually) | |
| grant_requirements | 13 | X/grants/[id]/requirements | A/fundraising/grants, L/briefing, crons, Reed | bound — Fundraising → Grants (+ Contract 3 obligation view) | |
| grants | 24 | X/grants | A/fundraising/grants, A/fundraising/plan, L/admin/plan/metrics | bound — Fundraising → Grants | |
| households | 1 | X/households | A/fundraising/donors/[id] | bound — Fundraising → Donor 360 ("Connected") | |
| hs_companies | 1,051 | L/hubspot/upserts (sync, service-role) | A/fundraising/prospects/[id], L/finance/hubspot-pledges | settings — HubSpot staging (named preservation: staging-only; see drift report below) | |
| hs_contacts | 2,541 | L/hubspot/upserts | A/fundraising/prospects, L/fundraising/promote-hs-contact | settings — HubSpot staging | |
| hs_deals | 590 | L/hubspot/upserts | **A/finance/close, A/fundraising/donors/[id], A/fundraising/prospects/[id], L/admin/overview/sources** | settings — HubSpot staging (**boundary violation live today** — see drift report) | |
| hs_engagements | 36,419 | L/hubspot/upserts | A/fundraising/{donors,prospects}/[id], X/fundraising/next-move | settings — HubSpot staging (same violation) | |
| hs_sync_jobs | 19 | L/hubspot/sync-engine | L/admin/dataAge | settings — Settings → Data sources (sync status) | |
| import_rows | 0 | X/imports/[id]/stage | X/imports/[id]/commit | settings — import layer (`specs/bloomos-import-layer.md`) | |
| imports | 3 | X/imports, L/hubspot/sync-engine | A/imports, A/settings | settings — Settings (import history) | |
| interactions | 55,422 | L/fundraising/gmail-sync, L/hubspot sync, X/interactions | A/fundraising/donors/[id] (timeline), X/search, L/meetings/* | bound — Fundraising → Donor 360 (timeline) | |
| invitations | 0 | (invite flow) | A/staff | bound — Organization → Team (invites) | |
| journey_enrollments | 0 | X/journeys/[id]/enroll, P/cron/journeys | A/fundraising/journeys, A/fundraising/donors/[id] | dormant — `specs/donor-lifecycle-journeys.md` (gate note: "saved view" is a functional downgrade of a state machine) | |
| journey_steps | 0 | X/journeys | same | dormant — `specs/donor-lifecycle-journeys.md` | |
| journeys | 0 | X/journeys | same | dormant — `specs/donor-lifecycle-journeys.md` | |
| meeting_exclusions | 0 | L/meetings/exclusions | same | **NEEDS RULING** — meet family (zero rows) | |
| meeting_records | 23 | X/meetings/[id], transcript ingestion | A/ops/friday, L/meetings/*, L/admin/ops/rhythm | bound — Work → Meetings | |
| meeting_suggested_tasks | 11 | X/meetings/[id]/{suggestions,transcript} | A/ops/friday, L/meetings/read | bound — Work → Meetings ("decisions waiting on follow-up") | |
| meeting_types | 9 | X/meet/types | P/meet/* (public scheduler), A/meetings/booking-page | **NEEDS RULING** — `/admin/meet` NO V2 HOME; the public `/meet` scheduler depends on it | |
| memberships | 14 | X/org/switch, invite flow | L/admin/auth, 8 more libs | settings — auth/tenancy infrastructure | |
| message_reactions | 7 | L/messaging/threads | same | bound — Inbox → Messages (gate flagged as unmapped; reactions ride the Messages tab) | |
| message_thread_members | 13 | L/messaging/threads | same | bound — Inbox → Messages | |
| message_threads | 5 | L/messaging/threads | same | bound — Inbox → Messages | |
| messages | 25 | L/messaging/threads | same | bound — Inbox → Messages | |
| metric_definitions | 72 | X/metrics, seeds | L/admin/metrics/catalog, L/briefing, `v_action_items` | bound — Impact → KPIs (Contract 2 catalog) | |
| metric_snapshots | 47 | X/metrics/[id]/snapshot, P/cron/metric-snapshots | A/strategic-plan/scorecard, L/admin/plan/metrics | bound — Impact → KPIs | |
| ms_cards | 85 | X/careers/{generate,review} (Reed drafts, human approves) | A/careers, P/ms + P/games (site) | bound — Programs → Content | |
| ms_deliveries | 0 | P/ms/deliver (site) | same | bound — site: `/teens/built-for` | |
| ms_explored | 1 | P/ms/{deliver,reveal} (site) | site deck/results pages | bound — site: `/teens/built-for` | |
| ms_occupations | 774 | scripts/import-onet | A/careers, P/ms + P/games (site) | bound — Programs → Content | |
| ms_rooms | 0 | P/ms/room (site) | same | bound — site: `/teens/built-for` group mode | |
| ms_sessions | 4 | P/ms/session (site) | site session/deck pages | bound — site: `/teens/built-for` | |
| notifications | 6 | L/notifications/notify | A/inbox, X/notifications | bound — Inbox | |
| opportunities | 598 | X/opportunities, promote flow | A/fundraising (pipeline board), A/fundraising/today, forecast math | bound — Fundraising → Pipeline | |
| ops_projects | 28 | X/ops/projects, X/grants/[id]/seed-tasks, X/report | A/ops/projects, A/strategic-plan | bound — Work → Projects | |
| ops_tasks | 441 | 15+ writers (see recon §A.1): X/ops/tasks, capture, report, Reed, crons, templates | A/ops, queue/briefing/cockpit, `v_action_items`, `work_block_tasks` | bound — Work → Tasks (+ Home → Today via the obligation view) | |
| org_comms_settings | 2 | X/comms/settings | L/comms/settings | **NEEDS RULING** — comms family (carries live per-org config incl. SafeSpace) | |
| org_email_allowlist | 12 | (seeded) | L/email/operator | settings — email infrastructure | |
| org_entitlements | 63 | (seeded by hand per tenant) | L/admin/entitlements, L/admin/actionQueue | settings — the module fence | |
| org_settings | 1 | (seeded) | L/fundraising/steward | settings | |
| org_terminology | 13 | X/staff/terminology | L/admin/entities | settings — Settings → Terminology | |
| orgs | 4 | (seeded) | L/admin/orgs, shell, crons | settings — tenancy | |
| page_views | 4,239 | P/analytics/pageview (site) | X/analytics | bound — Impact → Analytics (site visits) | |
| participant_stages | 22 | (seeded per org) | L/admin/program/stages | **NEEDS RULING** — per-org lifecycle unrepresented in the People design | |
| partner_contacts | 135 | X/partners/contacts | A/partners, L/meetings/match | bound — Programs → Partners | |
| partner_interactions | 0 | X/partners/interactions | A/partners/[id], L/meetings/* | bound — Programs → Partners | |
| partner_waitlist | 4 | P/partner-waitlist (site form) | X/partners | bound — Programs → Partners (waitlist intake) | |
| partners | 149 | X/partners, P/program-partner-signup | A/partners, X/search, L/meetings/* | bound — Programs → Partners | |
| pipeline_stages | 59 | X/pipeline-stages | A/fundraising/settings/stages, L/fundraising/stages, L/hubspot/sync-out | settings — Settings → Fundraising (stage config) | |
| pipelines | 7 | X/pipeline-stages | L/fundraising/stages | settings — Settings → Fundraising | |
| plan_archives | 1 | manual migration (`2027_ogsm_v3_phase1_archive.MANUAL.sql`) | — (nothing reads it) | **NEEDS RULING** — write-only archive | |
| plan_foundation | 2 | X/plan/foundation | A/strategic-plan, Reed | bound — Organization → Strategy | |
| plan_goals | 19 | X/plan/goals | A/strategic-plan/*, L/admin/briefing/gather | bound — Organization → Strategy | |
| plan_initiatives | 55 | X/plan/initiatives | A/strategic-plan, A/ops/projects/[id] | bound — Organization → Strategy (+ Work → Projects "serves objective") | |
| plan_kpi_snapshots | 4 | X/plan/kpis/[id], refresh cron | A/strategic-plan/scorecard | bound — Impact → KPIs | |
| plan_kpis | 55 | X/plan/kpis | A/strategic-plan, L/admin/plan/metrics, cockpit | bound — Impact → KPIs / Organization → Strategy | |
| plan_objective_notes | 1 | X/plan/objective-notes | A/strategic-plan/review | bound — Organization → Strategy | |
| plan_objective_tasks | 2 | X/plan/objective-tasks | A/strategic-plan/review | bound — Organization → Strategy | |
| plan_objectives | 9 | X/plan/objectives | A/strategic-plan, briefing, cockpit | bound — Organization → Strategy | |
| plan_reviews | 1 | X/plan/reviews | A/strategic-plan/review, L/admin/plan/metrics | bound — Organization → Strategy (monthly review) | |
| pledge_payments | 7 | X/pledges/payments | A/fundraising/pledges, L/fundraising/plan-moments | bound — Finance → Forecast (pledges-due tier) | |
| pledges | 2 | X/pledges | A/fundraising/pledges | bound — Finance → Forecast (pledges-due tier) | |
| profiles | 12 | X/account/profile | L/admin/auth, L/admin/profile, 6 more | settings — account infrastructure | |
| programs | 7 | L/admin/program/programs | same | bound — Programs → Cohorts (program parent, participant-spine spec) | |
| quiz_submissions | 49 | P/quiz-submit (site) | X/stats, X/submissions | **NEEDS RULING** — `aa.quiz` has no V2 home | |
| recurring_plans | 7 | X/recurring, P/stripe-webhook | A/fundraising/recurring, A/fundraising/donors, P/cron/journeys | bound — Fundraising → Donors & Funders (recurring view — depends on the `segments` ruling) | |
| reed_activity_log | 12 | P/reed/ask | same | settings — Reed audit infrastructure | |
| reed_drafts | 0 | Reed (L/agents/reed/tools) | A/reed, P/reed/drafts | bound — Inbox (Reed approvals) + Reed panel | |
| reed_messages | 24 | P/reed/ask | A/reed, L/meetings/dossier | **NEEDS RULING** — `/admin/reed` removed with no archive plan | |
| reed_next_moves | 0 | X/fundraising/next-move | same | dormant — `specs/bloomos-reed-strategy.md` | |
| reed_plan_proposals | 0 | P/reed/proposals | A/reed, Reed tools | dormant — `specs/reeds-proposal-review.md` | |
| reed_suggestions | 2 | Reed tools | A/reed, P/reed/suggestions/[id] (accept → task) | bound — Reed panel (suggestion → task flow) | |
| reed_threads | 8 | P/reed/ask | A/reed, L/meetings/dossier | **NEEDS RULING** — Reed archive, with reed_messages | |
| relationships | 0 | X/constituents/merge | X/search/profile | dormant — `specs/fundraising-v2.md` (Donor 360 "Connected") | |
| research_runs | 0 | X/fundraising/research/[id]/run | X/fundraising/research/[id] | **NEEDS RULING** — prospect-research family (zero rows) | |
| review_competencies | 5 | (seeded) | A/staff reviews lib | **NEEDS RULING** — reviews family | |
| review_cycles | 0 | X/staff/reviews | A/staff reviews lib | **NEEDS RULING** — reviews family (zero rows) | |
| review_feedback | 0 | X/staff/reviews/feedback | A/staff reviews lib, `v_review_feedback_visible` | **NEEDS RULING** — reviews family (zero rows) | |
| review_manager_notes | 0 | X/staff/reviews summary | A/staff reviews lib | **NEEDS RULING** — reviews family (zero rows) | |
| review_summaries | 0 | X/staff/reviews summary | A/staff reviews lib | **NEEDS RULING** — reviews family (zero rows) | |
| rhythm_sessions | 3 | X/ops/rhythm | A/ops/monday, A/ops/friday | bound — Work → Plan & Close (named preservation: carry semantics) | |
| role_permissions | 105 | (seeded) | L/admin/auth | settings — auth infrastructure | |
| segments | 0 | X/segments | A/fundraising/comms, A/fundraising/reports, X/comms send | **NEEDS RULING** — the saved-view backbone has zero rows and no builder UI; Phase-1 scope decision | |
| soft_credits | 0 | X/gifts/[id]/soft-credits | A/fundraising/donors/[id] | bound — Fundraising → Donor 360 (gift detail) | |
| staff | 8 | X/staff | A/staff, A/strategic-plan/review, L/agenda/week-view | bound — Organization → Team | |
| staff_goals | 0 | X/staff/[id]/goals | A/staff | bound — Organization → Team | |
| staff_kpi_snapshots | 0 | X/staff kpis snapshot | L/admin/staff/metrics | bound — Organization → Team (per-person measures) | |
| staff_kpis | 0 | X/staff/[id]/kpis | A/staff, L/admin/staff/metrics | bound — Organization → Team | |
| stewardship_rules | 11 | (seeded) | L/fundraising/stewardship (drives P/cron/stewardship-milestones) | **NEEDS RULING** — appears in no design file; its cron writes obligations | |
| stories | 0 | (comms/stories module, unbuilt) | `v_publishable_stories`, `v_story_suggestions` | dormant — `specs/comms-v2-mail-merge.md` | |
| story_consents | 0 | same | same | dormant — comms spec; **contractual requirement under the SafeSpace agreement** (gate) | |
| story_media | 0 | same | same | dormant — comms spec | |
| story_subjects | 0 | same | same | dormant — comms spec | |
| strategy_angles | 8 | X/strategy/angles, strategy/discover | A/fundraising/strategy, **public `/strategy` page** | **NEEDS RULING** — strategy room family (public consumer exists) | |
| strategy_room_meta | 1 | X/strategy/room-meta | A/fundraising/strategy, public `/strategy` | **NEEDS RULING** — strategy room family | |
| students | 70 | X/students, X/applications/[id]/accept, imports | A/students, A/cohorts/[id], X/search, L/admin/plan/metrics | bound — Programs → People | |
| user_org_state | 3 | (org switcher) | L/admin/statusLine | settings — tenancy infrastructure | |
| webhook_events | 0 | P/webhooks/hubspot | same | settings — integration infrastructure | |
| work_block_tasks | 0 | L/agenda/work-blocks | L/agenda/week-view, L/admin/ops/rhythm, X/ops/tasks/[id] | bound — Work → My Week (named preservation: FK into ops_tasks verified live) | |
| work_blocks | 0 | L/agenda/work-blocks | L/agenda/*, L/admin/ops/rhythm | bound — Work → My Week | |
| ygb_attendance | 0 | X/ygb/attendance | same | **NEEDS RULING** — `aa.ygb` family (zero rows) | |
| ygb_registrations | 8 | P/ygb/register, P/ygb/showcase-rsvp (site) | X/ygb/{registrations,attendance} | **NEEDS RULING** — YGB pinned view undesigned | |

---

## Named preservations — verification and drift report

Checked against the codebase and live schema today.

1. **Report an issue — holds, no drift.** All four entry points exist (`QuickAddButton.tsx:56`, `CaptureDock.tsx`/`CaptureBox.tsx:172`, `MobileTabBar.tsx:255` → `ReportModal.tsx`); the guided interview (`/api/admin/report/debug`), prompt synthesis + `claude-prompt` label, the "BloomOS Upgrades" `ops_projects` auto-create, the `ops_tasks` filing (`category='product'`, labels, owner assignment), the `bloomos-reports` bucket, and the operator email are all as the gate describes. `pageContext.path` is still prompt-buried, not structured — the gate's one permitted change remains to be made.

2. **Calendar invariants — hold, one clarification.** `work_block_tasks.task_id → ops_tasks(id)` exists in production **with `ON DELETE CASCADE`** (task deletion removes its block link; block deletion cascades only the link rows, never tasks — consistent with "calendar actions never delete tasks", but Contract 3 work must not introduce task deletion, only status changes). `work_blocks` and `work_block_tasks` are both at 0 rows, as the gate predicted.

3. **Rhythm carry semantics — hold.** `roll_count`, `planned_week`, `planned_day`, `day_order` all present on `ops_tasks`; `rhythm_sessions` live with 3 rows, written by `X/ops/rhythm`, read by both ritual pages.

4. **HubSpot boundary — the violation is wider than the gate states.** The gate says "the current Finance page" reads `hs_deals` directly. The trace shows **four** direct `hs_*` readers on daily screens: `A/finance/close` (hs_deals via `L/finance/hubspot-pledges`), `A/fundraising/donors/[id]` (hs_deals + hs_engagements), `A/fundraising/prospects/[id]` (hs_companies, hs_contacts, hs_deals, hs_engagements), and the V1 cockpit (`L/admin/overview/sources` reads hs_deals). One naming drift: reconciliation runs through the **`external_refs`** table (4,376 rows), not "`external_ids`" as the gate writes. V2 remains the moment all four readers stop.

## Findings outside the ledger's columns

**Ghost tables — code that references tables which do not exist in production.** The inverse of the preservation problem, found during the trace:

| Referenced table | Where | Status |
|---|---|---|
| `fr_plan_strategies`, `fr_plan_gift_levels` | `A/fundraising/plan`, `X/fundraising/plan/*` (live pages) | migration `supabase/migrations/fundraising_plan.sql` is written and RLS-registered but **not applied to production** — the Fundraising → Plan page is running against missing tables |
| `ai_calls` | `L/ai/ledger.ts` | migration `create_ai_calls_ledger.sql` not applied |
| `program_partners` | `X/programs` | **no committed migration exists** — the code comments acknowledge the runtime failure |

These don't block the gate (nothing to preserve), but two of them are live routes writing into a missing table — worth applying or ruling on alongside the ledger.

---

*Stop point. No rulings proposed beyond what the gate itself pre-names. Phase 1 remains blocked until the 45 `NEEDS RULING` rows carry signed rulings.*
